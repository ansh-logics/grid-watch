import { ScopedUser } from '../db';
import { SensorsRepository } from '../repositories/sensors.repository';

export class SensorService {
  static async listSensors(user: ScopedUser, zoneId?: string) {
    return SensorsRepository.listByZone(user, zoneId);
  }

  static async getSensorDetail(user: ScopedUser, sensorId: string) {
    const detail = await SensorsRepository.getDetail(user, sensorId);
    if (!detail) {
      throw { status: 404, message: 'Sensor not found or inaccessible by zone' };
    }
    return detail;
  }
}
