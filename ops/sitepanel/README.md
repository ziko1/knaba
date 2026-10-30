# Account-scoped Cockpit website panel

This package adds a small website dashboard for two local Unix accounts, `knaba`
and `vsp`. A root-owned server registry assigns resources to numeric UIDs. The
browser cannot select a tenant: a Unix-domain socket authenticates every request
using the kernel's `SO_PEERCRED` UID. This is shared-host account isolation, not
virtual-machine isolation or unrestricted root access for both accounts.

## Security boundary

The broker accepts only `catalog` or a fixed site's allowlisted `start`, `stop`,
`restart`, and optional `backup` action. Docker targets, systemd services, mounts,
labels, local health probes and backup environments come from the private registry.
Docker actions use the inspected immutable container ID. Configured systemd units
must run as the owning non-root account, with trusted files and no privileged
execution prefixes. Secrets, raw command output and application logs are never
returned by the API.

Tenant accounts must have no unrestricted sudo, Docker, LXD or equivalent host
administrator grants. The included Polkit rule denies direct host mutations by
these two users. Registry, code, units, backup controllers and their ancestors must
be root-owned and not writable by either tenant. Hiding native Cockpit navigation
is a user-interface choice, not an authorization control. Ordinary Unix metadata
and the physical host remain shared; a trusted host operator retains root access.

Requests have a UUID and a durable SQLite receipt keyed by `(uid, request_id)`.
Authorization happens before receipt lookup. An unfinished or timed-out operation
blocks further mutations for that resource, including after daemon restart. A
trusted operator must inspect actual state and reconcile that receipt before
unblocking it; never delete a pending receipt just to retry. The browser preserves
an uncertain UUID. It does not automatically retry mutations.

## Files and deployment

Install `sitepanel.py` under `/usr/local/libexec/sitepanel/`, the `sitepanel`
wrapper under `/usr/local/bin/`, and `cockpit/sitepanel/` under
`/usr/local/share/cockpit/`. Use root ownership and modes 0644 for source/static
files, 0755 for directories and the wrapper. Install `sitepanel.service` and review
its host-specific backup write path before activation. Create the system group
`sitepanel` and add only authorized local users. The daemon creates its socket at
`/run/sitepanel/control.sock` with mode 0660 and group `sitepanel`.

Provide a private `/etc/sitepanel/sites.json` (root:root 0600, containing no
passwords) with version 1, an `accounts` map keyed by numeric UID, and a `resources`
map. Each account has `name`, `display_name`, `home`, and `sites`. A site has `id`,
`label`, `domains`, `url`, `admin_url`, `location` (`local` or `external`), `note`,
and an `actions` list. A local site also names its `resource` and optionally a
fixed `probe` (`port`, `path`, `host`). An external entry has no local resource or
actions and is never presented as having verified local health.

A resource contains `owner_uid`, `kind`, and `target`. Docker resources also set
`mount_roots` and `required_labels`; systemd resources set `user`, exactly matching
the owning account. An optional backup definition identifies a reviewed root-owned
controller, its `production` or `testing` environment, and its storage directory.
The included unit grants write access to the existing customer backup root only;
adapt and review it for another installation. Do not publish the live registry,
password handoff files, private snapshots or server receipts in this repository.

For tenant-focused Cockpit navigation, install the four JSON files from
`cockpit/tenant-overrides/` into each intended user's `~/.config/cockpit/`.
The first-install account helper does this as that user, refusing symlinks and
existing override files. Do not rerun that helper to update an existing host:
it also changes account policy and a password. Save existing overrides before
an administrator applies a separately reviewed update.

The documented `path-not-exists: "/"` condition excludes the native
`users`, `systemd` (package name `system`) and `metrics` packages completely.
Accounts, host services/logs/metrics and the host terminal therefore have neither
menu entries nor directly served package pages in a fresh session. The shell
override removes privileged bridge choices. Shell, base1, static and sitepanel
remain; the existing UID-authenticated broker is unchanged. Log out and back in
to discard old package manifests and frames; verify the authenticated manifests
and direct URLs in each new session.

These are user preferences, not an OS security boundary: the account can change
its own overrides, Cockpit's normal-user process API remains available, and Unix
account/process/host metadata can still be visible over SSH. Existing filesystem,
sudo, Polkit, socket and broker authorization controls remain essential. New
Cockpit extensions must be reviewed for host-wide information before installation.
The read-only verifier below rejects any unexpected package or navigation.

Use SSH/SFTP for files in the account's assigned writable workspace. On the
reviewed shared host these are `/srv/knaba/workspaces` and
`/srv/vsp/workspaces`; confirm their ownership and permissions when provisioning.
Production controller roots, including `/srv/knaba/customer`, secrets and backups
remain administrator-managed. Own-site start/stop/restart/allowed backups and
own-workspace files do not grant arbitrary host administration or access to the
other account's files. Restrict Cockpit PAM login to the intended local account
allowlist. Keep Cockpit on a private network; this package does not configure
networking.

## Safe transition and rollback

Before changing account privileges, save protected copies of changed files,
original group memberships and relevant directory permissions. Record workload
container IDs and start times. Verify an independent administrator path, new-user
PAM access, Cockpit and both accounts' own/foreign-site behavior first.

After revoking privileges, close only identified graphical login sessions and
verified desktop user services. Do not kill every process with a tenant UID:
container processes may share that host UID. Disable the actual display manager
and RDP services only after alternative access is verified. Set the next boot to
multi-user mode without isolating the target or rebooting. Recheck workloads and
private panel connectivity after every phase.

Rollback is an explicit administrator operation: stop the new broker, restore the
saved panel/PAM/Polkit configuration and directory metadata, and restore selected
original memberships only if the owner intends to undo isolation. Preserve
workloads, databases and operation receipts. Never restore a complete old passwd
or group database over unrelated concurrent account changes.

## Verification

```sh
python3 -m unittest discover -s tests -v
node cockpit/.verification/check-ui.cjs
```

On a host with Cockpit 360, run the read-only package check as each tenant.
The optional candidate directory merges the proposed overrides in memory.

```sh
python3 -B verify_tenant_ui.py --candidate cockpit/tenant-overrides
python3 -B verify_tenant_ui.py
```

The first command reports `candidate-in-memory`; the second verifies actual
installed package selection. Neither authenticates a browser, changes packages
or demonstrates OS metadata isolation. Official package/override documentation:
https://docs.cockpit-project.org/cockpit-guide/360/guide/packages.html

The Python tests use temporary ledgers and simulated runtime operations. The UI
test is a DOM/CLI contract harness with a simulated Cockpit API. They do not prove
live PAM login, operating-system isolation, a browser rendering check or reboot
recovery. Those require separately recorded live checks of the deployed hashes.
