# Acrylic: this fork's deployment files

Everything that turns this fork into the Jellyfin running at home, kept out of upstream's
directories so merges from `jellyfin/jellyfin` stay conflict-free.

| Path | What it is |
|---|---|
| `image/Dockerfile` | Builds the server image from this tree (see the header comment for the command). |
| `preview/trailer-preview.js` | Trailer preview on the Movies and Shows pages. Self-contained; the image adds one `<script>` tag for it. |
| `theme/acrylic.css` | The web theme. Not part of the image: paste into Dashboard > Branding > Custom CSS, or POST it to `/System/Configuration/branding`. |
| `patches/` | Changes to third-party plugins that are not in their upstream yet. |

## Branches

- `master` tracks upstream unchanged.
- `feat/streaming-diagnostics-logging` and `sec/require-auth-*` are one change each, cut from `master`.
- `acrylic-deploy` holds this directory.
- `integration/acrylic` merges all of the above and is what gets built and deployed.

## Building and deploying

```sh
git switch integration/acrylic
tag=13.0.0-dev-$(git rev-parse --short=10 HEAD)
git archive HEAD | docker build -f acrylic/image/Dockerfile -t jellyfin-acrylic:$tag -
```

The registry was unavailable when this was set up, so the image is copied to the node and
imported into containerd directly, and the deployment uses `imagePullPolicy: Never`:

```sh
docker save jellyfin-acrylic:$tag | zstd | ssh <node> 'zstd -d | docker load'
ssh <node> "docker save jellyfin-acrylic:$tag | sudo ctr -n k8s.io images import -"
```

The pod holds the node's only GPU, so a rolling update cannot start a second pod: scale the
deployment to 0, set the image to `docker.io/library/jellyfin-acrylic:$tag`, scale back to 1.

## Plugins the server expects (in `<config>/plugins/`)

| Plugin | Source |
|---|---|
| PostgreSQL Database Provider | `BORNIOS/Jellyfin-Database-Providers-Postgres` v3.0.3 with `patches/postgres-provider-record-applied-code-migrations.patch`, built against this tree's assemblies. Only needed again when importing a SQLite database. |
| Uploader | `jellyfin-plugin/` in the uploader's own repository. |
| Intro Skipper | Upstream release for Jellyfin 12 (loads on this tree). |

## Notes for whoever touches this next

- The LG webOS app is a shell around the server's web client, so the theme and the preview
  script reach the TV without installing anything on it. It only reloads them when the app is
  fully closed and reopened.
- Jellyfin treats webOS as a slow device: cards are not zoomed on focus, carry a border instead,
  and are clipped to their own box (`contain: paint`). The theme and the script both have
  rules for that mode; test TV changes with `show-animation` removed from the cards.
- Remote clients arrive through Cloudflare and Traefik. Jellyfin only sees their real address
  because `KnownProxies` lists the pod and node ranges and Traefik trusts forwarded headers
  from them; without that every remote client counts as local and gets no bitrate limit.
