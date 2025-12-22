import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Point {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  rating: number;
}

interface NearestPointIndicatorProps {
  userLocation: { latitude: number; longitude: number } | null;
  points: Point[];
  selectedPoint?: Point | null;
}


export const NearestPointIndicator: React.FC<NearestPointIndicatorProps> = ({
  userLocation,
  points,
  selectedPoint = null 
}) => {
  const [nearestPoint, setNearestPoint] = useState<Point | null>(null);
  const [direction, setDirection] = useState<number>(0);
  const [distance, setDistance] = useState<number>(0);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  };

  const calculateBearing = (userLat: number, userLon: number, pointLat: number, pointLon: number): number => {

  const φ1 = userLat * Math.PI / 180;
  const φ2 = pointLat * Math.PI / 180;
  const λ1 = userLon * Math.PI / 180;
  const λ2 = pointLon * Math.PI / 180;
  
  const Δλ = λ2 - λ1;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - 
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  const bearing = (θ * 180 / Math.PI + 360) % 360;
  
  return bearing;
};

    useEffect(() => {
    if (!userLocation) return;
    
    if (selectedPoint) {
      setNearestPoint(selectedPoint);
      const dist = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        selectedPoint.latitude,
        selectedPoint.longitude
      );
      setDistance(dist);
      
      const bearing = calculateBearing(
        userLocation.latitude,
        userLocation.longitude,
        selectedPoint.latitude,
        selectedPoint.longitude
      );
      setDirection(bearing);
      return;
    }
    
    if (points.length > 0) {
      let nearest = points[0];
      let minDistance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        points[0].latitude,
        points[0].longitude
      );

      points.forEach(point => {
        const dist = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          point.latitude,
          point.longitude
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearest = point;
        }
      });

      setNearestPoint(nearest);
      setDistance(minDistance);
      
      const bearing = calculateBearing(
        userLocation.latitude,
        userLocation.longitude,
        nearest.latitude,
        nearest.longitude
      );
      setDirection(bearing);
    }
  }, [userLocation, points, selectedPoint]);

  if (!userLocation || !nearestPoint || points.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.directionContainer}>
        <MaterialIcons 
          name="navigation" 
          size={40} 
          color="#007AFF"
          style={{ transform: [{ rotate: `${direction}deg` }] }}
        />
        <Text style={styles.distanceText}>
          {distance < 1 
            ? `${(distance * 1000).toFixed(0)} м` 
            : `${distance.toFixed(2)} км`
          }
        </Text>
      </View>
      <Text style={styles.pointName}>{nearestPoint.name}</Text>
      <Text style={styles.ratingText}>★ {nearestPoint.rating.toFixed(1)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    alignItems: 'center',
    minWidth: 120,
  },
  directionContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  distanceText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontWeight: '600',
  },
  pointName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  ratingText: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '600',
  },
});