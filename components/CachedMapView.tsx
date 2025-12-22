import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

const MAP_CACHE_KEY = '@cached_map_html';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

const API_KEY = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';
const API_HEADERS: Record<string, string> = { 'x-api-key': API_KEY };

type MapCachePayload = {
  html: string;
  timestamp: number;
  url: string;
};

interface CachedMapViewProps {
  serverUrl: string;
  isOnline: boolean;
  onMessage: (event: any) => void;
  injectedJavaScript?: string;

  webViewRef?: React.RefObject<WebView | null>;

  onShouldStartLoadWithRequest?: (req: any) => boolean;
}

export const CachedMapView: React.FC<CachedMapViewProps> = ({
  serverUrl,
  isOnline,
  onMessage,
  injectedJavaScript = '',
  webViewRef,
  onShouldStartLoadWithRequest,
}) => {
  const [cachedHtml, setCachedHtml] = useState<string | null>(null);
  const [cachedUrl, setCachedUrl] = useState<string>(serverUrl);
  const [lastCacheTime, setLastCacheTime] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [downloadingInitial, setDownloadingInitial] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const isCacheStale = useMemo(() => {
    if (!cachedHtml || !lastCacheTime) return false;
    return Date.now() - lastCacheTime > CACHE_DURATION;
  }, [cachedHtml, lastCacheTime]);

  const injectedAuthScript = useMemo(() => {
    return `
(function () {
  try {
    var KEY = '${API_KEY}';
    var ORIGIN = (function() {
      try { return new URL('${serverUrl}').origin; } catch(e) { return null; }
    })();

    function looksLikeApi(rawUrl) {
      try {
        var s = String(rawUrl || '');
        return s.indexOf('/api') === 0 || s.indexOf('api/data') !== -1 || s.indexOf('api/rate') !== -1 || s.indexOf('/api/') !== -1;
      } catch (e) {
        return false;
      }
    }

    function shouldAttach(win, rawUrl) {
      try {
        if (!rawUrl) return false;

        if (String(rawUrl).indexOf('/api') === 0) return true;

        var u = new URL(rawUrl, (ORIGIN || (win && win.location && win.location.href) || undefined));
        if (ORIGIN && u.origin === ORIGIN) {
          return (u.pathname === '/api/data') || (u.pathname.indexOf('/api/') === 0) || (u.pathname.indexOf('/api') === 0);
        }
        return looksLikeApi(rawUrl);
      } catch (e) {
        return looksLikeApi(rawUrl);
      }
    }

    function setHeader(win, headers, name, value) {
      try {
        if (!headers) headers = {};

        if (typeof win.Headers !== 'undefined' && headers instanceof win.Headers) {
          headers.set(name, value);
          return headers;
        }

        if (Array.isArray(headers)) {
          headers.push([name, value]);
          return headers;
        }

        headers[name] = value;
        return headers;
      } catch (e) {
        try {
          headers = headers || {};
          headers[name] = value;
        } catch (e2) {}
        return headers;
      }
    }

    function patchWindow(win) {
      try {
        if (!win || win.__rn_api_key_patched) return;
        win.__rn_api_key_patched = true;

        if (typeof win.fetch === 'function') {
          var origFetch = win.fetch.bind(win);
          win.fetch = function (input, init) {
            try {
              var url = '';
              if (typeof input === 'string') url = input;
              else if (input && typeof input.url === 'string') url = input.url;

              if (shouldAttach(win, url)) {
                init = init || {};
                init.headers = setHeader(win, init.headers, 'x-api-key', KEY);
              }
            } catch (e) {}
            return origFetch(input, init);
          };
        }

        if (win.XMLHttpRequest && win.XMLHttpRequest.prototype) {
          var XHR = win.XMLHttpRequest;
          var origOpen = XHR.prototype.open;
          var origSend = XHR.prototype.send;

          XHR.prototype.open = function (method, url) {
            try {
              this.__rn_last_url = url;
            } catch (e) {}
            return origOpen.apply(this, arguments);
          };

          XHR.prototype.send = function (body) {
            try {
              var url = this.__rn_last_url;
              if (shouldAttach(win, url)) {
                try {
                  this.setRequestHeader('x-api-key', KEY);
                } catch (e) {}
              }
            } catch (e) {}
            return origSend.apply(this, arguments);
          };
        }
      } catch (e) {}
    }

    patchWindow(window);

    var tries = 0;
    var t = setInterval(function () {
      tries++;
      try {
        var iframe = document.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
          patchWindow(iframe.contentWindow);
        }
      } catch (e) {}
      if (tries > 120) clearInterval(t);
    }, 250);
  } catch (e) {}
})();
true;
    `.trim();
  }, [serverUrl]);

  const loadCachedMap = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(MAP_CACHE_KEY);
      if (!cached) return;

      const parsed = JSON.parse(cached) as Partial<MapCachePayload>;
      if (typeof parsed?.html === 'string' && parsed.html.length > 0) {
        setCachedHtml(parsed.html);
      }
      if (typeof parsed?.timestamp === 'number') {
        setLastCacheTime(parsed.timestamp);
      }
      if (typeof parsed?.url === 'string' && parsed.url.length > 0) {
        setCachedUrl(parsed.url);
      }
    } catch (error) {
      console.error('Ошибка загрузки кэша карты:', error);
    }
  }, []);

  const refreshCache = useCallback(async () => {
    if (!isOnline) return false;

    try {
      setLastError(null);
      const response = await fetch(serverUrl, { headers: API_HEADERS });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      const ts = Date.now();
      const finalUrl = (response as any)?.url || serverUrl;

      const cacheData: MapCachePayload = {
        html,
        timestamp: ts,
        url: finalUrl,
      };

      await AsyncStorage.setItem(MAP_CACHE_KEY, JSON.stringify(cacheData));
      setCachedHtml(html);
      setLastCacheTime(ts);
      setCachedUrl(finalUrl);
      return true;
    } catch (error) {
      console.error('Ошибка обновления кэша:', error);
      setLastError('Не удалось скачать карту. Проверьте интернет и попробуйте ещё раз.');
      return false;
    }
  }, [isOnline, serverUrl]);

  useEffect(() => {
    (async () => {
      try {
        await loadCachedMap();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCachedMap]);

  useEffect(() => {
    if (loading) return;
    if (cachedHtml) return;
    if (!isOnline) return;
    if (downloadingInitial) return;

    (async () => {
      setDownloadingInitial(true);
      await refreshCache();
      setDownloadingInitial(false);
    })();
  }, [cachedHtml, downloadingInitial, isOnline, loading, refreshCache]);

  useEffect(() => {
    if (loading) return;
    if (!cachedHtml) return;
    if (!isOnline) return;
    if (!isCacheStale) return;

    refreshCache();
  }, [cachedHtml, isCacheStale, isOnline, loading, refreshCache]);

  if (loading || downloadingInitial) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>
          {downloadingInitial ? 'Скачиваем карту для офлайн…' : 'Загрузка карты…'}
        </Text>
      </View>
    );
  }

  if (!isOnline && !cachedHtml) {
    return (
      <View style={styles.offlineContainer}>
        <Text style={styles.offlineTitle}>Карта недоступна офлайн</Text>
        <Text style={styles.offlineText}>
          Первый запуск должен быть с интернетом, чтобы скачать офлайн-карту.
        </Text>
      </View>
    );
  }

  const source = isOnline
    ? { uri: serverUrl, headers: API_HEADERS }
    : { html: cachedHtml!, baseUrl: cachedUrl || serverUrl };

  return (
    <View style={styles.wrap}>
      <WebView
        ref={(webViewRef as any) || undefined}
        source={source as any}
        style={styles.webview}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        scalesPageToFit
        originWhitelist={['*']}
        cacheEnabled
        cacheMode={'LOAD_CACHE_ELSE_NETWORK' as any}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest as any}
        onLoadEnd={() => console.log('Карта загружена')}
        injectedJavaScriptBeforeContentLoaded={injectedAuthScript}
        injectedJavaScript={
          injectedJavaScript +
          `
try {
  if (!navigator.onLine) {
    console.log('Карта в офлайн-режиме');
  }
} catch(e) {}
true;
          `
        }
      />

      {isOnline && cachedHtml && isCacheStale ? (
        <View style={styles.staleBadge}>
          <Text style={styles.staleText}>ℹ️ Есть новая версия карты — обновляем…</Text>
        </View>
      ) : null}

      {lastError ? (
        <View style={styles.errorBadge}>
          <Text style={styles.errorText}>⚠️ {lastError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refreshCache()}>
            <Text style={styles.retryText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  webview: { flex: 1 },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },

  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  offlineText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },

  staleBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
  },
  staleText: {
    fontSize: 12,
    color: '#111827',
    textAlign: 'center',
    fontWeight: '600',
  },

  errorBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#B00020',
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
  retryButton: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#111827',
  },
  retryText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
  },
});
