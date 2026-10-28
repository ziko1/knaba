import Foundation

/// Browser handoff only; identity lives in the site/ERP server session, not a native bearer token.
enum WorkspaceRoutes {
    static func url(origin raw: String, path: String) -> URL? {
        guard ["/app/", "/konto/", "/console"].contains(path),
              raw.count <= 512,
              let value = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              value.scheme?.lowercased() == "https",
              let host = value.host, !host.isEmpty,
              value.user == nil, value.password == nil,
              value.query == nil, value.fragment == nil,
              value.path.isEmpty || value.path == "/",
              value.port == nil || value.port == 443
        else { return nil }
        var result = URLComponents()
        result.scheme = "https"
        result.host = host.lowercased()
        result.path = path
        return result.url
    }
}
