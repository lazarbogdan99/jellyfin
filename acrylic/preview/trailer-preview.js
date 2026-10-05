/* Trailer preview for Jellyfin's web client.
 *
 * On the Movies and Shows library pages, when a card keeps focus (remote) or hover (mouse) for a
 * moment, a 16:9 panel opens over it showing the item's backdrop and then its trailer: a local
 * trailer file if the item has one, otherwise the YouTube trailer Jellyfin already lists in the
 * item's metadata (the one its own "Trailer" button plays). Items without a trailer are left
 * alone, and a panel whose trailer turns out not to play closes again. The grid itself never
 * moves. Moving away closes the panel.
 *
 * Self-contained: loaded by one <script> tag in index.html, no changes to jellyfin-web sources.
 * Per device: localStorage.setItem('acTrailerPreview', 'off') turns the preview off,
 * localStorage.setItem('acTrailerPreviewSound', 'off') keeps it silent.
 */
(function () {
    'use strict';

    if (window.__acTrailerPreview) {
        return;
    }

    window.__acTrailerPreview = true;

    var DWELL_MS = 700;
    var WIDE_RATIO = 16 / 9;
    var VOLUME = 45; // percent
    var EDGE_GAP = 16; // px kept between the panel and the screen edge
    var PREVIEW_TYPES = { Movie: true, Series: true };
    var LIBRARY_ROUTES = /^#\/(movies|tv)(\?|$)/;
    var trailerCache = new Map();
    var pendingTimer = null;
    var pendingCard = null;
    var wantedCard = null; // the card whose trailer lookup is awaited before its panel opens
    var active = null;
    var focusWatch = null;
    var reported = {};

    function setting(name) {
        try {
            return window.localStorage.getItem(name);
        } catch (e) {
            return null;
        }
    }

    function enabled() {
        return setting('acTrailerPreview') !== 'off';
    }

    function soundEnabled() {
        return setting('acTrailerPreviewSound') !== 'off';
    }

    function apiClient() {
        return window.ApiClient || null;
    }

    /* A short note in the server's log folder (Jellyfin's client-log endpoint), at most once per
       kind per page load: which browser this device runs, and whether the focus guard below was
       ever needed. Lets TV-only problems be diagnosed without access to the TV. */
    function report(kind, detail) {
        if (reported[kind]) {
            return;
        }

        try {
            var client = apiClient();
            if (!client || !client.accessToken()) {
                return;
            }

            reported[kind] = true;
            var request = new XMLHttpRequest();
            request.open('POST', client.getUrl('ClientLog/Document'), true);
            request.setRequestHeader('Content-Type', 'text/plain');
            request.setRequestHeader('Authorization', 'MediaBrowser Client="Trailer Preview", Device="' +
                String(client.deviceName ? client.deviceName() : 'device').replace(/"/g, '') + '", DeviceId="' +
                client.deviceId() + '", Version="1", Token="' + client.accessToken() + '"');
            request.send([
                'trailer-preview: ' + kind,
                'detail: ' + (detail || ''),
                'layout: ' + document.documentElement.className,
                'userAgent: ' + navigator.userAgent,
                'viewport: ' + window.innerWidth + 'x' + window.innerHeight
            ].join('\n'));
        } catch (e) {
            // diagnostics must never break the page
        }
    }

    function injectStyles() {
        var style = document.createElement('style');
        style.id = 'acTrailerPreviewStyles';
        style.textContent = [
            // Slower TVs get "contain: paint" on every card, which would clip the panel to the card.
            '.card.tp-on{position:relative;z-index:6;contain:layout style!important}',
            // While the panel is open it carries the focus outline; the card's own would show as
            // stray segments beside it.
            '.card.tp-on .cardScalable{overflow:visible;border-color:transparent!important;box-shadow:none!important}',
            '.tp-stage{position:absolute;overflow:hidden;border-radius:14px;' +
                'background:#05060a center/cover no-repeat;' +
                'box-shadow:0 0 0 2px rgba(255,255,255,.92),0 22px 50px rgba(0,0,0,.6);' +
                'pointer-events:none;opacity:0;transition:opacity .3s ease}',
            '.tp-stage.tp-visible{opacity:1}',
            '.tp-stage video{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .5s ease}',
            '.tp-stage.tp-playing video{opacity:1}',
            // Oversized so YouTube's title bar and logo fall outside the visible frame.
            '.tp-stage iframe{position:absolute;top:50%;left:50%;width:136%;height:136%;border:0;' +
                '-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);opacity:0;transition:opacity .5s ease}',
            '.tp-stage.tp-playing iframe{opacity:1}',
            // Frosted strip over the picture: blurred where the browser can, a denser fill where it cannot.
            '.tp-info{position:absolute;left:12px;right:12px;bottom:12px;display:flex;align-items:center;' +
                'padding:.6em .95em;border-radius:12px;background:rgba(24,24,26,.78);' +
                'border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.2)}',
            '@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){' +
                '.tp-info{background:rgba(24,24,26,.38);-webkit-backdrop-filter:blur(20px) saturate(1.7);backdrop-filter:blur(20px) saturate(1.7)}}',
            '.tp-title{flex:1 1 auto;min-width:0;font-weight:600;font-size:1.1em;line-height:1.25;text-align:left;color:#fff;' +
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.tp-badge{flex:0 0 auto;margin-left:1em;font-size:.7em;font-weight:600;letter-spacing:.08em;text-transform:uppercase;' +
                'color:rgba(255,255,255,.7);opacity:0;transition:opacity .4s ease}',
            '.tp-stage.tp-playing .tp-badge{opacity:1}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function preconnect() {
        ['https://www.youtube-nocookie.com', 'https://i.ytimg.com', 'https://www.youtube.com'].forEach(function (origin) {
            var link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = origin;
            document.head.appendChild(link);
        });
    }

    /* Only poster cards in the grids of the Movies and Shows library pages. */
    function eligibleCard(node) {
        if (!node || !node.closest || !LIBRARY_ROUTES.test(window.location.hash)) {
            return null;
        }

        var card = node.closest('.card');
        if (!card || !PREVIEW_TYPES[card.getAttribute('data-type')] || !card.getAttribute('data-id')) {
            return null;
        }

        var grid = card.closest('.itemsContainer');
        return grid && grid.classList.contains('vertical-wrap') ? card : null;
    }

    function fetchTrailer(itemId) {
        if (trailerCache.has(itemId)) {
            return trailerCache.get(itemId);
        }

        var client = apiClient();
        var userId = client.getCurrentUserId();
        var local = client.getJSON(client.getUrl('Items/' + itemId + '/LocalTrailers', { userId: userId })).catch(function () {
            return [];
        });
        var item = client.getJSON(client.getUrl('Items/' + itemId, { userId: userId })).catch(function () {
            return null;
        });
        var request = Promise.all([local, item]).then(function (results) {
            if (results[0] && results[0].length) {
                return { local: results[0][0] };
            }

            var videoId = firstYouTubeId(results[1] && results[1].RemoteTrailers);
            return videoId ? { youTubeId: videoId } : null;
        });
        trailerCache.set(itemId, request);
        return request;
    }

    function firstYouTubeId(remoteTrailers) {
        var list = remoteTrailers || [];
        for (var i = 0; i < list.length; i++) {
            var match = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/.exec(list[i].Url || '');
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    function youTubeEmbedUrl(videoId) {
        return 'https://www.youtube-nocookie.com/embed/' + videoId +
            '?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&start=4' +
            '&enablejsapi=1&origin=' + encodeURIComponent(window.location.origin);
    }

    function localTrailerUrl(trailer) {
        var client = apiClient();
        var source = trailer.MediaSources && trailer.MediaSources[0];
        return client.getUrl('Videos/' + trailer.Id + '/stream.mp4', {
            static: true,
            mediaSourceId: source ? source.Id : trailer.Id,
            ApiKey: client.accessToken()
        });
    }

    function backdropUrl(itemId) {
        return apiClient().getUrl('Items/' + itemId + '/Images/Backdrop', { maxWidth: 960, quality: 80 });
    }

    function cardTitle(card) {
        var text = card.querySelector('.cardText-first, .cardText');
        return (text && text.textContent.trim()) || card.getAttribute('aria-label') || '';
    }

    function schedule(card) {
        if (card === pendingCard || (active && active.card === card)) {
            return;
        }

        cancelPending();
        pendingCard = card;
        if (enabled() && apiClient()) {
            fetchTrailer(card.getAttribute('data-id'));
        }

        pendingTimer = window.setTimeout(function () {
            pendingTimer = null;
            pendingCard = null;
            activate(card);
        }, DWELL_MS);
    }

    function cancelPending() {
        if (pendingTimer) {
            window.clearTimeout(pendingTimer);
        }

        pendingTimer = null;
        pendingCard = null;
    }

    function activate(card) {
        if (!enabled() || !apiClient() || !document.body.contains(card) || !eligibleCard(card)) {
            return;
        }

        deactivate();

        // Nothing opens until the item is known to have a trailer.
        wantedCard = card;
        fetchTrailer(card.getAttribute('data-id')).then(function (found) {
            if (wantedCard !== card) {
                return;
            }

            wantedCard = null;
            if (found && document.body.contains(card)) {
                open(card, found);
            }
        });
    }

    function open(card, found) {

        var scalable = card.querySelector('.cardScalable');
        if (!scalable) {
            return;
        }

        var box = scalable.getBoundingClientRect();
        if (!box.width || !box.height || !scalable.clientHeight) {
            return;
        }

        var state = {
            card: card,
            stage: document.createElement('div'),
            video: null,
            frame: null,
            soundTried: false,
            soundAt: 0,
            onMessage: null,
            giveUpTimer: null
        };
        active = state;

        // Layout sizes rather than the on-screen rectangle: a focused TV card may be scaled up.
        // The panel sits over the card's border box, so the border does not peek out around it.
        var scale = box.width / (scalable.offsetWidth || box.width);
        var edge = parseFloat(window.getComputedStyle(scalable).borderLeftWidth) || 0;
        var panelWidth = Math.round(scalable.offsetHeight * WIDE_RATIO);
        var viewport = document.documentElement.clientWidth;
        var shift = 0;
        if (box.left + panelWidth * scale > viewport - EDGE_GAP) {
            // No room to the right: open towards the left, but never past the screen edge.
            shift = scalable.offsetWidth - panelWidth;
            if (box.left + shift * scale < EDGE_GAP) {
                shift = Math.round((EDGE_GAP - box.left) / scale);
            }
        }

        var itemId = card.getAttribute('data-id');
        state.stage.className = 'tp-stage';
        state.stage.style.width = panelWidth + 'px';
        state.stage.style.left = (shift - edge) + 'px';
        state.stage.style.top = -edge + 'px';
        state.stage.style.bottom = -edge + 'px';
        state.stage.style.backgroundImage = 'url("' + backdropUrl(itemId) + '")';
        state.stage.innerHTML = '<div class="tp-info"><div class="tp-title"></div><div class="tp-badge">Trailer</div></div>';
        state.stage.querySelector('.tp-title').textContent = cardTitle(card);

        card.classList.add('tp-on');
        scalable.appendChild(state.stage);
        window.requestAnimationFrame(function () {
            state.stage.classList.add('tp-visible');
        });

        if (found.local) {
            playLocal(state, found.local);
        } else {
            playYouTube(state, found.youTubeId);
        }
    }

    /* The trailer exists on paper but does not play here (embedding blocked, file unreadable):
       close the panel and do not offer this item again during this page load. */
    function giveUp(state) {
        trailerCache.set(state.card.getAttribute('data-id'), Promise.resolve(null));
        if (active === state) {
            deactivate();
        }
    }

    function playLocal(state, trailer) {
        var video = document.createElement('video');
        state.video = video;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.preload = 'auto';
        video.muted = !soundEnabled();
        video.volume = VOLUME / 100;
        video.addEventListener('playing', function () {
            if (active === state) {
                state.stage.classList.add('tp-playing');
            }
        });
        video.addEventListener('ended', function () {
            state.stage.classList.remove('tp-playing');
        });
        video.addEventListener('error', function () {
            giveUp(state);
        });
        video.src = localTrailerUrl(trailer);
        state.stage.insertBefore(video, state.stage.firstChild);

        var started = video.play();
        if (started && started.catch) {
            started.catch(function () {
                // Autoplay with sound refused: play silently instead; if that fails too the backdrop stays.
                video.muted = true;
                var retry = video.play();
                if (retry && retry.catch) {
                    retry.catch(function () {
                        giveUp(state);
                    });
                }
            });
        }
    }

    function playYouTube(state, videoId) {
        var frame = document.createElement('iframe');
        state.frame = frame;
        frame.setAttribute('allow', 'autoplay; encrypted-media');
        // Jellyfin's page asks browsers to send no referrer; YouTube refuses embeds without one (error 153).
        frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        frame.setAttribute('tabindex', '-1');
        frame.setAttribute('aria-hidden', 'true');

        var command = function (func, args) {
            try {
                frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args }), '*');
            } catch (e) {
                // the frame is gone
            }
        };

        // The player reports its state over postMessage once it has been told someone listens.
        // Start muted (always allowed), unmute once playing, and fall back to silence if that pauses it.
        state.onMessage = function (event) {
            if (event.source !== frame.contentWindow || typeof event.data !== 'string') {
                return;
            }

            var data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                return;
            }

            var info = data && data.info;
            var playerState = info && typeof info === 'object' ? info.playerState : info;
            if (playerState === 1) {
                if (active === state) {
                    state.stage.classList.add('tp-playing');
                }

                if (soundEnabled() && !state.soundTried) {
                    state.soundTried = true;
                    state.soundAt = Date.now();
                    command('setVolume', [VOLUME]);
                    command('unMute', []);
                }
            } else if (playerState === 2 && state.soundAt && Date.now() - state.soundAt < 2500) {
                state.soundAt = 0;
                command('mute', []);
                command('playVideo', []);
            } else if (playerState === 0) {
                state.stage.classList.remove('tp-playing');
            }
        };
        window.addEventListener('message', state.onMessage);
        frame.addEventListener('load', function () {
            try {
                frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
            } catch (e) {
                // without state reports the player stays hidden and the backdrop remains
            }
        });

        // Never show the player unless it reports that it is playing: an embed that is blocked,
        // restricted or slow would otherwise put YouTube's error screen in the panel.
        state.giveUpTimer = window.setTimeout(function () {
            if (active === state && !state.stage.classList.contains('tp-playing')) {
                giveUp(state);
            }
        }, 9000);

        frame.src = youTubeEmbedUrl(videoId);
        state.stage.insertBefore(frame, state.stage.firstChild);
        watchFocus(true);
    }

    /* On TV browsers the embedded YouTube player can pull keyboard focus into its frame. The remote
       then stops moving through the grid, and when the frame is later removed focus falls back to
       the page, which makes Jellyfin restart from the first card. While a preview is open, focus
       is therefore handed straight back to the card. */
    function guardFocus() {
        var state = active;
        if (!state || !state.frame || !document.body.contains(state.card)) {
            return;
        }

        if (document.activeElement === state.frame) {
            report('focus-returned', 'focus was inside the YouTube frame');
            focusCard(state.card);
        }
    }

    function focusCard(card) {
        try {
            window.focus();
            card.focus();
        } catch (e) {
            // focus stays where the browser puts it
        }
    }

    function watchFocus(on) {
        if (focusWatch) {
            window.clearInterval(focusWatch);
            focusWatch = null;
        }

        if (on) {
            focusWatch = window.setInterval(guardFocus, 250);
        }
    }

    function releaseFrame(state) {
        var frame = state.frame;
        if (!frame) {
            return;
        }

        if (document.activeElement === frame && document.body.contains(state.card)) {
            focusCard(state.card);
        }

        state.frame = null;
        frame.src = 'about:blank';
        if (frame.parentNode) {
            frame.parentNode.removeChild(frame);
        }
    }

    function deactivate() {
        var state = active;
        if (!state) {
            return;
        }

        active = null;
        watchFocus(false);

        if (state.onMessage) {
            window.removeEventListener('message', state.onMessage);
        }

        if (state.giveUpTimer) {
            window.clearTimeout(state.giveUpTimer);
        }

        releaseFrame(state);

        if (state.video) {
            try {
                state.video.pause();
                state.video.removeAttribute('src');
                state.video.load();
            } catch (e) {
                // releasing the decoder is best effort
            }
        }

        if (state.stage.parentNode) {
            state.stage.parentNode.removeChild(state.stage);
        }

        state.card.classList.remove('tp-on');
    }

    function leave(card) {
        if (pendingCard === card) {
            cancelPending();
        }

        if (wantedCard === card) {
            wantedCard = null;
        }

        if (active && active.card === card) {
            deactivate();
        }
    }

    function stopAll() {
        cancelPending();
        wantedCard = null;
        deactivate();
    }

    function onFocusIn(event) {
        var card = eligibleCard(event.target);
        if (card) {
            schedule(card);
        } else if (!(active && active.frame && event.target === active.frame)) {
            stopAll();
        }
    }

    function onFocusOut(event) {
        var card = eligibleCard(event.target);
        if (card && !card.contains(event.relatedTarget)) {
            leave(card);
        }
    }

    function onMouseOver(event) {
        if (!document.documentElement.classList.contains('layout-desktop')) {
            return;
        }

        var card = eligibleCard(event.target);
        if (card) {
            schedule(card);
        }
    }

    function onMouseOut(event) {
        var card = eligibleCard(event.target);
        if (card && !card.contains(event.relatedTarget)) {
            leave(card);
        }
    }

    function start() {
        injectStyles();
        preconnect();
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', onFocusOut, true);
        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('click', stopAll, true);
        window.addEventListener('blur', function () {
            window.setTimeout(guardFocus, 0);
        });
        window.addEventListener('hashchange', stopAll);
        window.addEventListener('popstate', stopAll);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                stopAll();
            }
        });
        window.setTimeout(function () {
            report('started', 'script active');
        }, 10000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
