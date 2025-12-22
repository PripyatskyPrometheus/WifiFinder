import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';

import { NearestPointIndicator } from '../../components/NearestPointIndicator';
import { CachedMapView } from '../../components/CachedMapView';
import { PointInfoModal } from '../../components/PointInfoModal';
import ApiService from '../../utils/apiService';
import { startPeriodicCheck } from '../../utils/networkCheck';

const SERVER = 'https://gnet-production.up.railway.app';
const API_KEY = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';
const API_HEADERS: Record<string, string> = { 'x-api-key': API_KEY };

const POINTS_CACHE_KEY = '@app_points_cache';

type LatLng = { latitude: number; longitude: number };

interface Point {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  rating: number;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
  const [count, setCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);

  const [mapUrl, setMapUrl] = useState<string>(SERVER);

  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [navigatingToPoint, setNavigatingToPoint] = useState<Point | null>(null);

  const webViewRef = useRef<WebView | null>(null);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);

  const findNearestPointTo = (latlng: LatLng): { point: Point; distanceKm: number } | null => {
    if (!points.length) return null;
    let best: Point = points[0];
    let bestD = haversineKm(latlng, points[0]);
    for (let i = 1; i < points.length; i++) {
      const d = haversineKm(latlng, points[i]);
      if (d < bestD) {
        best = points[i];
        bestD = d;
      }
    }
    return { point: best, distanceKm: bestD };
  };

  const injectedBridgeScript = useMemo(() => {
    return `
(function () {
  if (window.__rn_bridge_installed) return;
  window.__rn_bridge_installed = true;

  function post(msg) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    } catch (e) {}
  }

  function fixFullscreenIframe() {
    try {
      document.documentElement.style.height = '100%';
      document.body.style.height = '100%';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';

      var iframe = document.querySelector('iframe');
      if (!iframe) return;

      var wrap = iframe.parentElement;
      if (wrap) {
        wrap.style.position = 'fixed';
        wrap.style.left = '0';
        wrap.style.top = '0';
        wrap.style.right = '0';
        wrap.style.bottom = '0';
        wrap.style.width = '100%';
        wrap.style.height = '100%';
        wrap.style.margin = '0';
        wrap.style.padding = '0';
        wrap.style.overflow = 'hidden';
        wrap.style.background = 'transparent';
      }

      iframe.style.position = 'absolute';
      iframe.style.left = '0';
      iframe.style.top = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = '0';
      iframe.style.margin = '0';
      iframe.style.padding = '0';
      iframe.style.background = 'transparent';

      var trust = document.querySelector('div.alert, div.warning');
      if (trust && trust.innerText && trust.innerText.toLowerCase().indexOf('trusted') !== -1) {
        trust.style.display = 'none';
      }
    } catch (e) {}
  }

  function isLeafletMap(obj) {
    try {
      return !!obj && typeof obj === 'object' && typeof obj.eachLayer === 'function' && typeof obj.on === 'function' && typeof obj.getCenter === 'function';
    } catch (e) {
      return false;
    }
  }

  function findLeafletMap(win) {
    try {
      if (!win) return null;
      if (win.map && isLeafletMap(win.map)) return win.map;
      for (var k in win) {
        try {
          if (!Object.prototype.hasOwnProperty.call(win, k)) continue;
          var v = win[k];
          if (isLeafletMap(v)) return v;
        } catch (e) {}
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function getLeafletCtx() {
    try {
      if (window.L) {
        var map = findLeafletMap(window);
        if (map) return { win: window, L: window.L, map: map };
      }
    } catch (e) {}
    try {
      var iframe = document.querySelector('iframe');
      if (iframe && iframe.contentWindow && iframe.contentWindow.L) {
        var cw = iframe.contentWindow;
        var map2 = findLeafletMap(cw);
        if (map2) return { win: cw, L: cw.L, map: map2 };
      }
    } catch (e) {}
    return null;
  }

window.__rn_follow_user = true;
window.__rn_follow_timer = null;
window.__rn_last_user = null; // { lat: number, lon: number }
window.__rn_has_initial_view = false;

function getMaxZoom(ctx) {
  try {
    if (ctx && ctx.map && typeof ctx.map.getMaxZoom === 'function') {
      var z = ctx.map.getMaxZoom();
      if (typeof z === 'number' && isFinite(z)) return z;
    }
  } catch (e) {}
  return 19;
}

function panToUser(opts) {
  try {
    var ctx = getLeafletCtx();
    if (!ctx || !ctx.map || !window.__rn_last_user) return false;
    var lat = window.__rn_last_user.lat;
    var lon = window.__rn_last_user.lon;

    var animate = true;
    var zoom = null;
    if (opts && typeof opts === 'object') {
      if (typeof opts.animate === 'boolean') animate = opts.animate;
      if (typeof opts.zoom === 'number' && isFinite(opts.zoom)) zoom = opts.zoom;
    }

    if (zoom !== null) {
      ctx.map.setView([lat, lon], zoom, { animate: animate });
    } else {
      ctx.map.panTo([lat, lon], { animate: animate });
    }
    return true;
  } catch (e) {
    return false;
  }
}

window.__rn_setFollowUser = function (enabled) {
  try {
    window.__rn_follow_user = !!enabled;
    if (window.__rn_follow_user) {
      panToUser({ animate: true });
    }
    return true;
  } catch (e) {
    return false;
  }
};

window.__rn_pauseFollow = function (ms) {
  try {
    window.__rn_follow_user = false;
    try {
      if (window.__rn_follow_timer) clearTimeout(window.__rn_follow_timer);
    } catch (e) {}
    var delay = (typeof ms === 'number' && isFinite(ms)) ? ms : 12000;
    window.__rn_follow_timer = setTimeout(function () {
      try {
        window.__rn_follow_user = true;
        panToUser({ animate: true });
      } catch (e) {}
    }, delay);
    return true;
  } catch (e) {
    return false;
  }
};

window.__rn_recenterUser = function (lat, lon) {
  try {
    window.__rn_last_user = { lat: lat, lon: lon };
    window.__rn_follow_user = true;

    var ctx = getLeafletCtx();
    if (ctx && ctx.map) {
      var z = getMaxZoom(ctx);
      ctx.map.setView([lat, lon], z, { animate: true });
      window.__rn_has_initial_view = true;
      return true;
    }

    return true;
  } catch (e) {
    return false;
  }
};

function installFollowHandlers() {
  try {
    var ctx = getLeafletCtx();
    if (!ctx || !ctx.map) return false;

    if (ctx.win.__rn_follow_handlers_installed) return true;
    ctx.win.__rn_follow_handlers_installed = true;

    function onUserInteract() {
      try {
        if (window.__rn_pauseFollow) window.__rn_pauseFollow(12000);
      } catch (e) {}
    }

    try { ctx.map.on('mousedown', onUserInteract); } catch (e) {}
    try { ctx.map.on('touchstart', onUserInteract); } catch (e) {}
    try { ctx.map.on('dragstart', onUserInteract); } catch (e) {}
    try { ctx.map.on('zoomstart', onUserInteract); } catch (e) {}
    try { ctx.map.on('click', onUserInteract); } catch (e) {}

    return true;
  } catch (e) {
    return false;
  }
}

  window.__RN_MARKER_SIZES = window.__RN_MARKER_SIZES || {
    zoomRef: 14,
    wifi: { base: 10, zoomScale: 0.30, minMult: 1.0, maxMult: 2.2 },
    user: { base: 12, zoomScale: 0.10, minMult: 1.0, maxMult: 3.0 },
  };

  function __rn_clamp(n, a, b) {
    try { return Math.max(a, Math.min(b, n)); } catch (e) { return n; }
  }

  function __rn_getZoom(ctx) {
    try {
      if (ctx && ctx.map && typeof ctx.map.getZoom === 'function') {
        var z = ctx.map.getZoom();
        if (typeof z === 'number' && isFinite(z)) return z;
      }
    } catch (e) {}
    return window.__RN_MARKER_SIZES.zoomRef || 14;
  }

  function __rn_calcRadius(ctx, kind) {
    try {
      var cfg = window.__RN_MARKER_SIZES && window.__RN_MARKER_SIZES[kind];
      if (!cfg) return null;
      var z = __rn_getZoom(ctx);
      var zoomRef = window.__RN_MARKER_SIZES.zoomRef || 14;
      var mult = 1 + (z - zoomRef) * (cfg.zoomScale || 0);
      mult = __rn_clamp(mult, cfg.minMult || 1, cfg.maxMult || 999);
      var r = (cfg.base || 8) * mult;
      return Math.round(r * 10) / 10;
    } catch (e) {
      return null;
    }
  }

  function __rn_isCircleMarker(ctx, layer) {
    try {
      return !!(ctx && ctx.L && ctx.L.CircleMarker && layer instanceof ctx.L.CircleMarker);
    } catch (e) {
      return false;
    }
  }

  function __rn_applyWifiSize(ctx, layer) {
    try {
      if (!ctx || !layer) return;
      if (layer.__rn_is_user) return;
      if (layer.__rn_is_selected_point) return;

      if (!__rn_isCircleMarker(ctx, layer)) return;
      if (typeof layer.setRadius !== 'function') return;

      var r = __rn_calcRadius(ctx, 'wifi');
      if (typeof r === 'number' && isFinite(r)) {
        layer.setRadius(r);
      }
    } catch (e) {}
  }

  function __rn_applyAllWifiSizes(ctx) {
    try {
      if (!ctx || !ctx.map || typeof ctx.map.eachLayer !== 'function') return;
      ctx.map.eachLayer(function (layer) {
        __rn_applyWifiSize(ctx, layer);
      });
    } catch (e) {}
  }

  function __rn_applyUserSize(ctx) {
    try {
      if (!ctx || !ctx.win || !ctx.win.__rn_location_marker) return;
      var m = ctx.win.__rn_location_marker;
      if (typeof m.setRadius !== 'function') return;

      var r = __rn_calcRadius(ctx, 'user');
      if (typeof r === 'number' && isFinite(r)) {
        m.setRadius(r);
      }
    } catch (e) {}
  }

  function __rn_installSizeHandlers() {
    try {
      var ctx = getLeafletCtx();
      if (!ctx || !ctx.map) return false;
      if (ctx.win.__rn_size_handlers_installed) return true;
      ctx.win.__rn_size_handlers_installed = true;
      try {
        ctx.map.on('zoomend', function () {
          try {
            __rn_applyUserSize(ctx);
            __rn_applyAllWifiSizes(ctx);
          } catch (e) {}
        });
      } catch (e) {}
      try {
        __rn_applyUserSize(ctx);
        __rn_applyAllWifiSizes(ctx);
      } catch (e) {}

      return true;
    } catch (e) {
      return false;
    }
  }

window.__setUserLocation = function (lat, lon) {
  try {
    window.__rn_last_user = { lat: lat, lon: lon };

    var ctx = getLeafletCtx();
    if (ctx && ctx.L && ctx.map) {
      installFollowHandlers();

      if (!ctx.win.__rn_location_marker) {
        ctx.win.__rn_location_marker = ctx.L.circleMarker([lat, lon], {
          radius: 12,
          color: 'red',
          fillColor: 'red',
          fillOpacity: 1,
          weight: 2,
        }).addTo(ctx.map);
        ctx.win.__rn_location_marker.__rn_is_user = true;
      } else {
        ctx.win.__rn_location_marker.setLatLng([lat, lon]);
      }

      try { __rn_installSizeHandlers(); __rn_applyUserSize(ctx); } catch (e) {}

      if (window.__rn_follow_user) {
        if (!window.__rn_has_initial_view) {
          var z = getMaxZoom(ctx);
          ctx.map.setView([lat, lon], z, { animate: false });
          window.__rn_has_initial_view = true;
        } else {
          try {
            ctx.map.panTo([lat, lon], { animate: true });
          } catch (e) {}
        }
      }

      return true;
    }

    var div = document.getElementById('__rn_location_dot');
    if (!div) {
      div = document.createElement('div');
      div.id = '__rn_location_dot';
      div.style.position = 'absolute';
      div.style.width = '24px';
      div.style.height = '24px';
      div.style.borderRadius = '12px';
      div.style.background = 'red';
      div.style.boxShadow = '0 0 10px rgba(255,0,0,0.8)';
      div.style.zIndex = 999999;
      document.body.appendChild(div);
    }
    div.style.left = '50%';
    div.style.top = '50%';
    div.style.transform = 'translate(-50%, -50%)';
    return true;
  } catch (e) {
    return false;
  }
};

  window.__rn_highlightPoint = function (lat, lon) {
    try {
      var ctx = getLeafletCtx();
      try { if (window.__rn_pauseFollow) window.__rn_pauseFollow(12000); } catch (e) {}
      if (!ctx) return false;
      if (!ctx.win.__rn_selected_point_marker) {
        ctx.win.__rn_selected_point_marker = ctx.L.circleMarker([lat, lon], {
          radius: 10,
          color: '#ff0000',
          fillColor: '#ff0000',
          fillOpacity: 0.3,
          weight: 3,
        }).addTo(ctx.map);
      } else {
        ctx.win.__rn_selected_point_marker.setLatLng([lat, lon]);
      }
      try { ctx.win.__rn_selected_point_marker.__rn_is_selected_point = true; } catch (e) {}
      try {
        ctx.map.panTo([lat, lon], { animate: true });
      } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  };

  function attachClickToLayer(layer, ctx) {
    try {
      ctx = ctx || getLeafletCtx();
      if (!layer || layer.__rn_has_click) return;

      if (typeof layer.eachLayer === 'function' && typeof layer.getLatLng !== 'function') {
        layer.__rn_has_click = true;
        layer.eachLayer(function (l) {
          attachClickToLayer(l, ctx);
        });
        return;
      }

      if (typeof layer.getLatLng === 'function' && typeof layer.on === 'function') {
        if (layer.__rn_is_user) {
          layer.__rn_has_click = true;
          return;
        }

        layer.__rn_has_click = true;
        layer.on('click', function (e) {
          try {
            var ll = layer.getLatLng ? layer.getLatLng() : (e && e.latlng);
            if (!ll) return;
            post({ type: 'POINT_CLICK', latitude: ll.lat, longitude: ll.lng });
          } catch (err) {}
        });
      }
      try { if (ctx) __rn_applyWifiSize(ctx, layer); } catch (e) {}
    } catch (e) {}
  }

  function installPointClickHandlers() {
    try {
      var ctx = getLeafletCtx();
      if (!ctx || !ctx.map) return false;
      if (ctx.win.__rn_point_clicks_installed) return true;
      ctx.win.__rn_point_clicks_installed = true;

      ctx.map.eachLayer(function (layer) {
        attachClickToLayer(layer, ctx);
      });

      ctx.map.on('layeradd', function (ev) {
        try {
          if (ev && ev.layer) attachClickToLayer(ev.layer, ctx);
        } catch (e) {}
      });

      try { __rn_installSizeHandlers(); } catch (e) {}

      post({ type: 'POINT_CLICKS_READY' });
      return true;
    } catch (e) {
      return false;
    }
  }

  fixFullscreenIframe();
  installPointClickHandlers();

  var tries = 0;
  var t = setInterval(function () {
    tries++;
    fixFullscreenIframe();
    var ok = installPointClickHandlers();
    if (ok || tries > 60) {
      clearInterval(t);
    }
  }, 250);

  post({ type: 'WEBVIEW_LOADED' });
})();
true;
    `.trim();
  }, []);

  const sendLocationToWebview = (lat: number, lon: number) => {
    const js = `
(function(){
  try {
    if (window.__setUserLocation) {
      window.__setUserLocation(${lat}, ${lon});
    }
  } catch(e) {}
})();
true;
    `;
    webViewRef.current?.injectJavaScript(js);
  };

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission denied');
        return;
      }
      watchSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 1 },
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setUserLocation({ latitude: lat, longitude: lon });
          sendLocationToWebview(lat, lon);
        }
      );
    })();

    return () => {
      try {
        watchSubRef.current?.remove();
      } catch (e) {}
      watchSubRef.current = null;
    };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        const cached = await AsyncStorage.getItem(POINTS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const arr: Point[] = Array.isArray(parsed) ? parsed : (parsed?.points || []);
          setPoints(arr);
          setCount(arr.length);
        }
        if (isOnline) {
          const resp = await fetch(SERVER + '/api/data', { headers: { Accept: 'application/json', ...API_HEADERS } });
          const data = await resp.json();
          const formatted: Point[] = (data.points || []).map((p: any) => ({
            id: String(p.id ?? Math.random()),
            latitude: p.lat ?? p.latitude ?? p.y ?? 0,
            longitude: p.lng ?? p.lon ?? p.longitude ?? p.x ?? 0,
            name: p.name ?? `Точка ${p.id}`,
            rating: p.rating ?? 0,
          }));
          setPoints(formatted);
          setCount(formatted.length);
          await AsyncStorage.setItem(POINTS_CACHE_KEY, JSON.stringify(formatted));
        }
      } catch (e) {
        console.error('Init points error', e);
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, [isOnline]);

  useEffect(() => {
    const cleanup = startPeriodicCheck(SERVER, async (status: boolean) => {
      setIsOnline(status);
      if (status) {
        await syncData();
        await syncPendingRatings();
      }
    });
    return cleanup;
  }, []);

  const syncData = async () => {
    try {
      const resp = await fetch(SERVER + '/api/data', { headers: { Accept: 'application/json', ...API_HEADERS } });
      const data = await resp.json();
      const fresh: Point[] = (data.points || []).map((p: any) => ({
        id: String(p.id ?? Math.random()),
        latitude: p.lat ?? p.latitude ?? p.y ?? 0,
        longitude: p.lng ?? p.lon ?? p.longitude ?? p.x ?? 0,
        name: p.name ?? `Точка ${p.id}`,
        rating: p.rating ?? 0,
      }));
      setPoints(fresh);
      setCount(fresh.length);
      await AsyncStorage.setItem(POINTS_CACHE_KEY, JSON.stringify(fresh));
    } catch (e) {
      console.error('syncData error', e);
    }
  };

  const syncPendingRatings = async () => {
    if (!isOnline) return;
    try {
      const pendingStr = await AsyncStorage.getItem('@pending_ratings');
      if (!pendingStr) return;
      const pending = JSON.parse(pendingStr);
      if (!Array.isArray(pending) || pending.length === 0) return;

      const failed: any[] = [];
      for (const r of pending) {
        try {
          const ok = await ApiService.submitRating(r);
          if (!ok) failed.push(r);
        } catch (e) {
          failed.push(r);
        }
      }
      await AsyncStorage.setItem('@pending_ratings', JSON.stringify(failed));
    } catch (e) {
      console.error('syncPendingRatings error', e);
    }
  };

  const highlightPointOnMap = (point: Point) => {
    if (!webViewRef.current) return;
    const js = `
(function(){
  try {
    if (window.__rn_highlightPoint) {
      window.__rn_highlightPoint(${point.latitude}, ${point.longitude});
    }
  } catch(e) {}
})();
true;
    `;
    webViewRef.current.injectJavaScript(js);
  };

  const openPointModal = (point: Point) => {
    setSelectedPoint(point);
    setModalVisible(true);
    highlightPointOnMap(point);
  };

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (!data || !data.type) return;

      switch (data.type) {
        case 'POINT_CLICK': {
          const lat = Number(data.latitude);
          const lon = Number(data.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

          const nearest = findNearestPointTo({ latitude: lat, longitude: lon });
          if (!nearest) return;
          const THRESHOLD_KM = 0.05;
          if (nearest.distanceKm <= THRESHOLD_KM) {
            openPointModal(nearest.point);
          }
          break;
        }
        case 'WEBVIEW_LOADED':
        case 'POINT_CLICKS_READY': {
          if (userLocation) {
            sendLocationToWebview(userLocation.latitude, userLocation.longitude);
          }
          break;
        }

        default:
          break;
      }
    } catch (e) {
    }
  };

  return (
    <View style={styles.container}>
      <CachedMapView
        webViewRef={webViewRef}
        serverUrl={mapUrl}
        isOnline={isOnline}
        onMessage={handleWebViewMessage}
        injectedJavaScript={injectedBridgeScript}
        onShouldStartLoadWithRequest={(req: any) => {
          try {
            const url = String(req?.url || '');
            const isTopFrame = req?.isTopFrame ?? true;
            if (!isTopFrame) return true;
            if (url && url.startsWith(SERVER) && url !== mapUrl) {
              setMapUrl(url);
              return false;
            }
          } catch (e) {}
          return true;
        }}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Загрузка карты...</Text>
        </View>
      )}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusIndicator, isOnline ? styles.statusOnline : styles.statusOffline]}>
            <Text style={styles.statusText}>{isOnline ? '🟢 Онлайн' : '🔴 Офлайн'}</Text>
          </View>
        </View>

        <View style={styles.statusCenter}>
          {userLocation && points.length > 0 ? (
            <View style={styles.arrowWrap}>
              <NearestPointIndicator userLocation={userLocation} points={points} selectedPoint={navigatingToPoint} />
            </View>
          ) : null}
        </View>

        <View style={styles.statusRight}>
          <Text style={styles.pointsText}>Точек: {count}</Text>
          {userLocation ? (
            <Text style={styles.locationText}>
              📍 {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.bottomPanel}>
        <TouchableOpacity
          style={[styles.bottomButton, styles.locateButton]}
          onPress={() => {
            if (!userLocation) return;
            const js = `
(function(){
  try {
    if (window.__rn_recenterUser) {
      window.__rn_recenterUser(${userLocation.latitude}, ${userLocation.longitude});
    } else if (window.__setUserLocation) {
      window.__setUserLocation(${userLocation.latitude}, ${userLocation.longitude});
    }
  } catch(e) {}
})();
true;
            `;
            webViewRef.current?.injectJavaScript(js);
          }}
          disabled={!userLocation}
        >
          <Text style={styles.bottomButtonText}>🎯 Я</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomButton, styles.nearestButton]}
          onPress={() => {
            if (!userLocation) return;
            const nearest = findNearestPointTo(userLocation);
            if (nearest) openPointModal(nearest.point);
            const js = `
            (function(){
              try { if (window.__rn_pauseFollow) window.__rn_pauseFollow(12000); } catch(e) {}
            })();
            true;
            `;
            webViewRef.current?.injectJavaScript(js);
          }}
          disabled={!userLocation}
        >
          <Text style={styles.bottomButtonText}>Ближайшая</Text>
        </TouchableOpacity>
      </View>


      <PointInfoModal
        visible={modalVisible}
        point={selectedPoint}
        onClose={() => {
          setModalVisible(false);
          setSelectedPoint(null);
        }}
        onRate={async (pointId, rating) => {
          try {
            const success = await ApiService.submitRating({ pointId, rating });
            if (success) {
              await syncData();
            }
          } catch (e) {
            console.error('Rating error', e);
          }
        }}
        onNavigate={(point) => {
          setNavigatingToPoint(point);
          setModalVisible(false);
          highlightPointOnMap(point);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  webview: { flex: 1 },

  statusBar: {
    position: 'absolute',
    top: 25,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },

  statusLeft: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  statusCenter: { width: 110, alignItems: 'center', justifyContent: 'center' },
  statusRight: { flex: 1, alignItems: 'flex-end', justifyContent: 'center' },

  arrowWrap: { marginTop: -20, marginLeft: 435, transform: [{ scale: 1.2 }] },

  statusIndicator: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusOnline: { backgroundColor: 'rgba(76,175,80,0.2)' },
  statusOffline: { backgroundColor: 'rgba(244,67,54,0.2)' },
  statusText: { fontSize: 12, fontWeight: '600' },

  pointsText: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  locationText: { marginTop: 2, fontSize: 11, color: '#666', fontFamily: 'monospace' },

  bottomPanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    padding: 8,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 1000,
  },

  bottomButton: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateButton: { backgroundColor: '#111827' },
  nearestButton: { backgroundColor: '#2196F3' },
  bottomButtonText: { color: 'white', fontSize: 14, fontWeight: '700' },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingText: { marginTop: 10, fontSize: 14, color: '#333' },
});
