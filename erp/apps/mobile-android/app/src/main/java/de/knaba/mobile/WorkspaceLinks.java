package de.knaba.mobile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;

/** Strict portable HTTPS browser links. Does not copy native device bearer credentials. */
public final class WorkspaceLinks {
    private static final Set<String> ROUTES = Set.of("/app/", "/konto/", "/console");
    private WorkspaceLinks() {}
    public static URI url(String origin, String path) {
        if (!ROUTES.contains(path) || origin == null || origin.isBlank() || origin.length() > 512)
            throw new IllegalArgumentException("INVALID_WORKSPACE_ORIGIN");
        try {
            URI root = new URI(origin.trim());
            if (!"https".equalsIgnoreCase(root.getScheme()) || root.getHost() == null ||
                root.getRawUserInfo() != null || root.getRawQuery() != null || root.getRawFragment() != null ||
                !(root.getRawPath() == null || root.getRawPath().isEmpty() || root.getRawPath().equals("/")) ||
                !(root.getPort() == -1 || root.getPort() == 443))
                throw new IllegalArgumentException("INVALID_WORKSPACE_ORIGIN");
            return new URI("https", null, root.getHost().toLowerCase(Locale.ROOT), -1, path, null, null);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("INVALID_WORKSPACE_ORIGIN", e);
        }
    }
}
