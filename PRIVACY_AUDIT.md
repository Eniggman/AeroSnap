# Privacy audit

Audit date: 2026-08-28

The AeroSnap 2.0 source tree and release installer were checked before publication.

- No local Windows username or absolute development-machine path remains in tracked source or documentation.
- No email address, token-like value, private-key marker, credential file, `.env` file, or browser/user-data file was found.
- The generated Cargo `target` directory was removed. It is ignored because compiler caches can contain local filesystem paths.
- The release executable was rebuilt with Rust path remapping before packaging.
- The final NSIS installer was scanned as UTF-8/ANSI and UTF-16 for the local username and development paths; no matches were found.
- Image assets contain no metadata tags reported by `ffprobe`.
- The release checksum is stored in `release/SHA256SUMS.txt`.

The installer is not digitally signed. A future maintainer should repeat the binary-path scan after every release build and publish a newly calculated checksum.
