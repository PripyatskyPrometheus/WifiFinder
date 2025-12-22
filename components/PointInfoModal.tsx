import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Point {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  rating: number;
}

interface PointInfoModalProps {
  visible: boolean;
  point: Point | null;
  onClose: () => void;
  onRate: (pointId: string, rating: number) => void;
  onNavigate: (point: Point) => void;
}

export const PointInfoModal: React.FC<PointInfoModalProps> = ({
    visible,
    point,
    onClose,
    onRate,
    onNavigate
}) => {
  const [userRating, setUserRating] = useState(0);
  const [tempRating, setTempRating] = useState(0);

  if (!point) return null;

const handleRate = () => {
  if (userRating > 0 && point) {
    Alert.alert('Отправка оценки', `Отправляем оценку ${userRating} звёзд...`,
      [],
      { cancelable: false }
    );
    
    onRate(point.id, userRating);
    
    setTimeout(() => {
      Alert.alert(
        'Спасибо!',
        `Вы оценили точку "${point.name}" на ${userRating} звёзд`,
        [{ 
          text: 'OK', 
          onPress: () => {
            setUserRating(0);
            setTempRating(0);
            onClose();
          }
        }]
      );
    }, 1000);
  } else {
    Alert.alert('Внимание', 'Пожалуйста, выберите оценку от 1 до 5 звёзд');
  }
};

  const renderStars = (rating: number, isInteractive = false) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={isInteractive ? () => setUserRating(star) : undefined}
            onPressIn={isInteractive ? () => setTempRating(star) : undefined}
            onPressOut={isInteractive ? () => setTempRating(0) : undefined}
            disabled={!isInteractive}
          >
            <MaterialIcons
              name={star <= (isInteractive ? tempRating || userRating : rating) ? "star" : "star-border"}
              size={32}
              color={isInteractive ? "#FFD700" : "#FFC107"}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialIcons name="close" size={28} color="#666" />
          </TouchableOpacity>

          <Text style={styles.pointTitle}>{point.name}</Text>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Текущий рейтинг:</Text>
            {renderStars(point.rating)}
            <Text style={styles.ratingText}>{point.rating.toFixed(1)}/5.0</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ваша оценка:</Text>
            {renderStars(userRating, true)}
            <Text style={styles.hintText}>
              {userRating > 0 ? `Выбрано: ${userRating} звезд` : 'Нажмите на звёзды'}
            </Text>
          </View>

          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={[styles.button, styles.rateButton, userRating === 0 && styles.buttonDisabled]}
              onPress={handleRate}
              disabled={userRating === 0}
            >
              <MaterialIcons name="thumb-up" size={22} color="white" />
              <Text style={styles.buttonText}>Оставить рейтинг</Text>
            </TouchableOpacity>

            <TouchableOpacity
            style={[styles.button, styles.navigateButton]}
            onPress={() => {
                if (point) {
                onNavigate(point);
                }
            }}
            >
            <MaterialIcons name="navigation" size={22} color="white" />
            <Text style={styles.buttonText}>Проложить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 350,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 5,
  },
  pointTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 25,
    color: '#333',
  },
  section: {
    alignItems: 'center',
    marginBottom: 25,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#555',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10,
    gap: 8,
  },
  ratingText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF9800',
    marginTop: 5,
  },
  hintText: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  rateButton: {
    backgroundColor: '#46b94aff',
  },
  navigateButton: {
    backgroundColor: '#2196F3',
  },
  buttonDisabled: {
    backgroundColor: '#CCCCCC',
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
});