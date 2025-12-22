import React, { useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

interface MapLineOverlayProps {
  webViewRef: React.RefObject<WebView | null>;
  userLocation: { latitude: number; longitude: number } | null;
  targetPoint: { latitude: number; longitude: number; name: string } | null;
  visible: boolean;
}

export const MapLineOverlay: React.FC<MapLineOverlayProps> = ({
  webViewRef,
  userLocation,
  targetPoint,
  visible
}) => {
  const prevLineId = useRef<string>('');

  useEffect(() => {
    if (!visible || !userLocation || !targetPoint || !webViewRef.current) {
      removeLineFromMap();
      return;
    }

    const lineId = `line_${userLocation.latitude}_${userLocation.longitude}_${targetPoint.latitude}_${targetPoint.longitude}`;

    if (lineId === prevLineId.current) {
      return;
    }

    prevLineId.current = lineId;

const drawLineScript = `
  (function() {
    const oldLines = document.querySelectorAll('svg.map-line, svg[id^="line_"]');
    oldLines.forEach(line => line.remove());

    const iframe = document.querySelector('iframe');
    if (!iframe) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'line_${lineId}';
    svg.classList.add('map-line');
    svg.style.cssText = \`
      position: absolute;
      top: \${iframe.offsetTop}px;
      left: \${iframe.offsetLeft}px;
      width: \${iframe.offsetWidth}px;
      height: \${iframe.offsetHeight}px;
      pointer-events: none;
      z-index: 999998;
    \`;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', (iframe.offsetWidth / 2).toString());
    line.setAttribute('y1', (iframe.offsetHeight / 2).toString());
    line.setAttribute('x2', (iframe.offsetWidth / 2 + 100).toString());
    line.setAttribute('y2', (iframe.offsetHeight / 2 - 80).toString());
    line.setAttribute('stroke', 'rgba(255, 0, 0, 0.6)');
    line.setAttribute('stroke-width', '2'); // ТОНЬШЕ
    line.setAttribute('stroke-dasharray', '6,3');

    svg.appendChild(line);
    document.body.appendChild(svg);

    console.log('✅ Линия нарисована (тонкая)');
  })();
  true;
`;

    webViewRef.current.injectJavaScript(drawLineScript);

    return () => {
      removeLineFromMap();
    };
  }, [userLocation, targetPoint, visible, webViewRef]);

  const removeLineFromMap = () => {
    if (webViewRef.current && prevLineId.current) {
      webViewRef.current.injectJavaScript(`
        const line = document.getElementById('${prevLineId.current}');
        if (line) line.remove();
        console.log('🗑️ Линия удалена');
        true;
      `);
      prevLineId.current = '';
    }
  };
  return null;
};