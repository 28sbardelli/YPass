import { describe, expect, it, vi } from 'vitest';
import { createWebController } from '../../src/controllers/web-controller.js';

describe('web controller kiosk scan flow', () => {
  it('reads appointment actions from the scan form body', async () => {
    const passService = {
      listUpcomingAppointments: vi.fn().mockResolvedValue([
        { id: 'appt-1', origin_name: 'Main Office', destination_name: 'Library', scheduled_at: '2030-01-01T12:00:00.000Z' },
      ]),
      kioskOptions: vi.fn().mockResolvedValue({
        kiosk: { kiosk_code: 'main-office', name: 'Main Office' },
        destinations: [],
      }),
    };

    const controller = createWebController({
      passService,
      kioskService: {},
      userService: {},
      config: { kioskManagerCode: 'manager' },
    });

    const req = {
      body: {
        studentNumber: '111111',
        appointmentAction: 'show',
      },
      kiosk: { kiosk_code: 'main-office' },
      currentUser: null,
    };

    const next = vi.fn();
    const res = {
      req: { currentUser: null },
      status: vi.fn().mockReturnThis(),
      render: vi.fn(),
    };

    await expect(controller.scanKiosk(req, res, next)).resolves.toBeUndefined();
    expect(passService.listUpcomingAppointments).toHaveBeenCalledWith('111111');
    expect(passService.kioskOptions).toHaveBeenCalledWith('main-office');
    expect(res.render).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
