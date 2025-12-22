const SERVER_URL = 'https://gnet-production.up.railway.app';
const API_KEY = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';


export interface RatingData {
  pointId: string;
  rating: number;
  timestamp?: number;
}

class ApiService {
static async submitRating(ratingData: RatingData): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_URL}/api/rate/${encodeURIComponent(ratingData.pointId)}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        rating: ratingData.rating,
      }),
    });

    console.log('📤 Отправка рейтинга:', ratingData, 'Статус:', response.status);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Ответ сервера:', result);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Ошибка отправки:', error);
    return false;
  }
}
}

export default ApiService;