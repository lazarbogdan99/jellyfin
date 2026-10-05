# Image for this fork: the official Jellyfin 12.1 runtime (jellyfin-ffmpeg, web client, GPU
# environment) with the server binaries replaced by a build of this tree, plus:
#   - PostgreSQL 18 client tools (the PostgreSQL provider plugin shells out to pg_dump/psql)
#   - the trailer preview script, loaded by one <script> tag added to the web client
#   - an "Upload" entry in the web client's menu, pointing at the Uploader plugin's page
#
# Build from the repository root with a clean context (no .git, no build output):
#   git archive HEAD | docker build -f acrylic/image/Dockerfile -t jellyfin-acrylic:<tag> -

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish Jellyfin.Server --configuration Release --runtime linux-x64 --self-contained true \
        --output /out -p:DebugSymbols=false -p:DebugType=none

FROM jellyfin/jellyfin:12.1

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && . /etc/os-release \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && rm -rf /var/lib/apt/lists/* \
 && mv /jellyfin/jellyfin-web /jellyfin-web && rm -rf /jellyfin && mkdir /jellyfin && mv /jellyfin-web /jellyfin/jellyfin-web

COPY --from=build /out/ /jellyfin/
COPY acrylic/preview/trailer-preview.js /jellyfin/jellyfin-web/acrylic/trailer-preview.js

# The script's address carries a hash of its content, so caches never serve a stale copy.
RUN set -e; cd /jellyfin/jellyfin-web; \
    chmod 644 acrylic/trailer-preview.js; \
    v=$(sha256sum acrylic/trailer-preview.js | cut -c1-10); \
    sed -i "s#</body>#<script defer=\"defer\" src=\"acrylic/trailer-preview.js?v=${v}\"></script></body>#" index.html; \
    grep -q "acrylic/trailer-preview.js?v=${v}" index.html; \
    sed -i 's#"menuLinks": \[\]#"menuLinks": [{"name": "Upload", "url": "/Plugins/Uploader/Page", "icon": "cloud_upload"}]#' config.json; \
    grep -q '"/Plugins/Uploader/Page"' config.json
