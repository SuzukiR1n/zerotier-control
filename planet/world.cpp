// SPDX-License-Identifier: MIT
// Uses ZeroTier 1.16.2's public World/ECC SDK (MPL-2.0).
// Newly implemented utility; does not modify the retired attic/world generator.
#include <node/World.hpp>
#include <node/Identity.hpp>
#include <node/ECC.hpp>
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
#include <chrono>
#include <cstring>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
using namespace ZeroTier;
using json = nlohmann::json;
static std::string read(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("Cannot read " + path);
    return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
}
static void save(const std::string& path, const void* data, size_t size) {
    std::ofstream out(path + ".tmp", std::ios::binary | std::ios::trunc);
    if (!out || !out.write(static_cast<const char*>(data), size)) throw std::runtime_error("Cannot write " + path);
    out.close();
    if (std::rename((path + ".tmp").c_str(), path.c_str())) throw std::runtime_error("Cannot commit " + path);
}
static void newKey(const char* path, const ECC::Pair& pair) {
    const int fd = open(path, O_WRONLY | O_CREAT | O_EXCL, 0600);
    if (fd < 0) throw std::runtime_error("Cannot create signing key");
    const bool ok = write(fd, pair.pub.data, sizeof(pair.pub.data)) == sizeof(pair.pub.data)
        && write(fd, pair.priv.data, sizeof(pair.priv.data)) == sizeof(pair.priv.data);
    close(fd);
    if (!ok) throw std::runtime_error("Cannot persist signing key");
}
static ECC::Pair key(const char* path) {
    const auto bytes = read(path);
    if (bytes.size() != ZT_ECC_PUBLIC_KEY_SET_LEN + ZT_ECC_PRIVATE_KEY_SET_LEN) throw std::runtime_error("Invalid signing key size");
    ECC::Pair p;
    std::memcpy(p.pub.data, bytes.data(), sizeof(p.pub.data));
    std::memcpy(p.priv.data, bytes.data() + sizeof(p.pub.data), sizeof(p.priv.data));
    return p;
}
static World decode(const std::string& bytes) {
    if (bytes.empty() || bytes.size() > ZT_WORLD_MAX_SERIALIZED_LENGTH) throw std::runtime_error("Invalid planet size");
    Buffer<ZT_WORLD_MAX_SERIALIZED_LENGTH> buffer(bytes.data(), bytes.size());
    World w;
    if (w.deserialize(buffer, 0) != bytes.size() || w.type() != World::TYPE_PLANET) throw std::runtime_error("Invalid planet format");
    return w;
}
static json info(const World& w) {
    json roots = json::array();
    for (const auto& r : w.roots()) {
        char identity[ZT_IDENTITY_STRING_BUFFER_LENGTH];
        json endpoints = json::array();
        for (const auto& endpoint : r.stableEndpoints) { char address[128]; endpoints.push_back(endpoint.toString(address)); }
        roots.push_back({{"identity", r.identity.toString(false, identity)}, {"stableEndpoints", endpoints}});
    }
    return {{"format", "zerotier-control-planet-v1"}, {"worldId", w.id()}, {"timestamp", w.timestamp()}, {"roots", roots}};
}
int main(int argc, char** argv) {
    umask(0077);
    try {
        if (argc == 3 && std::string(argv[1]) == "inspect") { std::cout << info(decode(read(argv[2]))).dump(2) << '\n'; return 0; }
        if (argc != 4 || std::string(argv[1]) != "generate") throw std::runtime_error("Usage: zt-world generate config.json planet | zt-world inspect planet");
        const auto config = json::parse(read(argv[2])), items = config.at("roots");
        if (!items.is_array() || items.empty() || items.size() > ZT_WORLD_MAX_ROOTS) throw std::runtime_error("Invalid root count");
        std::vector<World::Root> roots;
        for (const auto& item : items) {
            World::Root r;
            if (!r.identity.fromString(item.at("identity").get<std::string>().c_str()) || r.identity.hasPrivate() || !r.identity.locallyValidate()) throw std::runtime_error("Root must have a valid public identity");
            const auto endpoints = item.at("stableEndpoints");
            if (!endpoints.is_array() || endpoints.empty() || endpoints.size() > ZT_WORLD_MAX_STABLE_ENDPOINTS_PER_ROOT) throw std::runtime_error("Invalid endpoint count");
            for (const auto& e : endpoints) { InetAddress a(e.get<std::string>().c_str()); if ((!a.isV4() && !a.isV6()) || !a.port()) throw std::runtime_error("Invalid IP/port endpoint"); r.stableEndpoints.push_back(a); }
            roots.push_back(r);
        }
        const bool previous = access("previous.c25519", F_OK) == 0, current = access("current.c25519", F_OK) == 0;
        if (previous != current) throw std::runtime_error("A signing key is missing; restore it from backup");
        if (!previous) { const auto pair = ECC::generate(); newKey("previous.c25519", pair); newKey("current.c25519", pair); }
        const auto signing = key("previous.c25519"), next = key("current.c25519");
        uint64_t timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
        if (access(argv[3], F_OK) == 0) timestamp = std::max(timestamp, decode(read(argv[3])).timestamp() + 1);
        const auto w = World::make(World::TYPE_PLANET, ZT_WORLD_ID_EARTH, timestamp, next.pub, roots, signing);
        Buffer<ZT_WORLD_MAX_SERIALIZED_LENGTH> signData, bytes;
        w.serialize(signData, true);
        if (!ECC::verify(signing.pub, signData.data(), signData.size(), w.signature())) throw std::runtime_error("Signing key verification failed");
        w.serialize(bytes, false);
        if (decode(std::string(reinterpret_cast<const char*>(bytes.data()), bytes.size())) != w) throw std::runtime_error("World round-trip failed");
        save(argv[3], bytes.data(), bytes.size());
        std::cout << info(w).dump(2) << '\n';
        return 0;
    } catch (const std::exception& e) { std::cerr << "Planet generation failed: " << e.what() << '\n'; return 1; }
}
