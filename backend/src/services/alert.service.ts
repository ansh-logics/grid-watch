import { AlertsRepository, SuppressionsRepository } from '../repositories/alerts.repository';
import { ScopedUser } from '../db';
import { withTransaction } from '../db';

export class AlertService {
  /**
   * Evaluates the requested target state against acceptable transition scopes.
   * Leverages explicit isolation locking.
   */
  static async changeStatus(user: ScopedUser, alertId: string, newStatus: string): Promise<void> {
    const validMap: Record<string, string[]> = {
      'open': ['acknowledged', 'resolved'],
      'acknowledged': ['resolved'],
      'resolved': [],
    };

    const currentStatus = await AlertsRepository.findAlertStatusScoped(user, alertId);

    if (!currentStatus) {
      throw { status: 404, message: 'Alert not found or inaccessible by Operator zone' };
    }

    if (!validMap[currentStatus]?.includes(newStatus)) {
      throw { status: 400, message: `Invalid transition from ${currentStatus} to ${newStatus}` };
    }

    // Rely on the standard repository context to securely wrap the updates with an audit trail
    await AlertsRepository.updateStatus(user, alertId, currentStatus, newStatus);
  }

  static async suppressSensor(user: ScopedUser, sensorId: string, startTime: string, endTime: string): Promise<string> {
    if (!startTime || !endTime) {
       throw { status: 400, message: 'startTime and endTime required parameters.' };
    }

    return await SuppressionsRepository.createSuppression(user, sensorId, startTime, endTime);
  }
}
