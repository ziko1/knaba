import Foundation

/// Minimal partner projection. The ERP derives both tenant and counterparty from the session.
struct ERPPartnerOrder: Decodable, Sendable {
    let id: String
    let status: String
    let updatedAt: Date

    enum Keys: String, CodingKey { case id, status, updatedAt }

    init(from decoder: Decoder) throws {
        let row = try decoder.container(keyedBy: Keys.self)
        id = try row.decode(String.self, forKey: .id)
        status = try row.decode(String.self, forKey: .status)
        let timestamp = try row.decode(String.self, forKey: .updatedAt)
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard Self.validID(id), !status.isEmpty, status.utf8.count <= 64,
              let date = iso.date(from: timestamp) else { throw ERPFailure.invalidResponse }
        updatedAt = date
    }

    static func validID(_ id: String) -> Bool {
        !id.isEmpty && id.utf16.count <= 100 && !id.utf8.contains(0)
    }

    private static func component(_ id: String) throws -> String {
        // Also encode periods so "A..B" stays valid under the transport's traversal guard.
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_~")
        guard validID(id), let encoded = id.addingPercentEncoding(withAllowedCharacters: allowed) else { throw ERPFailure.invalidPath }
        return encoded
    }

    static func listPath(after: String?) throws -> String {
        let path = "/api/v1/partner/orders?limit=50"
        guard let after else { return path }
        return try path + "&after=" + component(after)
    }

    static func detailPath(id: String) throws -> String {
        if id == "." || id == ".." { return try "/api/v1/partner/order?id=" + component(id) }
        return try "/api/v1/partner/orders/" + component(id)
    }

    static func decode(_ data: Data, expectedID: String) throws -> Self {
        let order = try JSONDecoder().decode(Self.self, from: data)
        guard order.id.utf8.elementsEqual(expectedID.utf8) else { throw ERPFailure.invalidResponse }
        return order
    }
}

struct ERPPartnerOrderPage: Decodable, Sendable {
    let items: [ERPPartnerOrder]
    let nextAfter: String?

    enum Keys: String, CodingKey { case items, nextAfter }
    init(from decoder: Decoder) throws {
        let page = try decoder.container(keyedBy: Keys.self)
        items = try page.decode([ERPPartnerOrder].self, forKey: .items)
        nextAfter = try page.decode(String?.self, forKey: .nextAfter)
        guard items.count <= 50, Set(items.map { Data($0.id.utf8) }).count == items.count else { throw ERPFailure.invalidResponse }
        if let nextAfter {
            guard let last = items.last, last.id.utf8.elementsEqual(nextAfter.utf8) else { throw ERPFailure.invalidResponse }
        }
    }

    static func decode(_ data: Data, after: String?) throws -> Self {
        let page = try JSONDecoder().decode(Self.self, from: data)
        if let after, page.items.contains(where: { $0.id.utf8.elementsEqual(after.utf8) }) { throw ERPFailure.invalidResponse }
        return page
    }
}
