import Foundation

/// Credentials have a bounded, one-shot path and never enter durable command recovery.
enum ERPCredentialPolicy {
    static func isOneShot(_ name: String) -> Bool {
        name == "user.password.rotate" || name == "user.mfa.configure"
    }

    static func sensitiveKey(_ key: String) -> Bool {
        let value = key.lowercased().replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression)
        if value == "key" { return true }
        return ["password", "passphrase", "secret", "token", "credential", "privatekey", "apikey", "encryptionkey",
                "signingkey", "authorization", "cookie", "csrf", "otp", "totp", "bearer"].contains { value.contains($0) }
    }

    static func containsSecret(_ value: Any, depth: Int = 0) throws -> Bool {
        guard depth <= 24 else { throw ERPFailure.invalidPayload }
        if let object = value as? [String: Any] {
            guard object.count <= 256 else { throw ERPFailure.invalidPayload }
            for (key, child) in object {
                guard key.utf16.count <= 200 else { throw ERPFailure.invalidPayload }
                if sensitiveKey(key) { return true }
                if try containsSecret(child, depth: depth + 1) { return true }
            }
        } else if let array = value as? [Any] {
            guard array.count <= 2000 else { throw ERPFailure.invalidPayload }
            for child in array {
                if try containsSecret(child, depth: depth + 1) { return true }
            }
        }
        return false
    }

    static func validateOneShot(_ name: String, input: [String: Any]) throws {
        guard let current = input["currentPassword"] as? String,
              (1...128).contains(current.utf16.count) else { throw ERPFailure.invalidPayload }
        switch name {
        case "user.password.rotate":
            guard Set(input.keys) == ["currentPassword", "newPassword"],
                  let next = input["newPassword"] as? String,
                  (8...128).contains(next.utf16.count) else { throw ERPFailure.invalidPayload }
        case "user.mfa.configure":
            guard Set(input.keys) == ["currentPassword", "secret", "otp"],
                  let secret = input["secret"] as? String,
                  secret.range(of: "^[A-Z2-7]{16,100}$", options: .regularExpression) == (secret.startIndex..<secret.endIndex),
                  let otp = input["otp"] as? String,
                  otp.range(of: "^[0-9]{6}$", options: .regularExpression) == (otp.startIndex..<otp.endIndex) else { throw ERPFailure.invalidPayload }
        default: throw ERPFailure.sensitiveCommand
        }
    }

    /// Keep future authority fields too. /me's reporting timestamp alone is not authority.
    static func authoritySnapshot(_ identityData: Data) throws -> Data {
        guard let document = try JSONSerialization.jsonObject(with: identityData) as? [String: Any],
              var actor = document["actor"] as? [String: Any] else { throw ERPFailure.invalidResponse }
        actor.removeValue(forKey: "mfaVerifiedAt")
        for key in ["roles", "permissions", "siteIds", "warehouseIds", "customerIds"] where actor[key] != nil {
            guard let values = actor[key] as? [String] else { throw ERPFailure.invalidResponse }
            actor[key] = values.sorted()
        }
        return try JSONSerialization.data(withJSONObject: actor, options: .sortedKeys)
    }
}
