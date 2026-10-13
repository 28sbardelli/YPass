import { regenerateSession } from '#middleware/session.js';

export function createApiController(container) {
  const { passService, passRepository, kioskService } = container;

  return {
    me(req, res) {
      const user = req.currentUser;
      res.json({
        data: {
          id: user.id,
          displayName: user.display_name,
          email: user.primary_email,
          roles: user.roles,
          permissions: user.permissions,
        },
      });
    },
    async exampleFormbarHttp(req, res, next) {
      try {
        if (!container.formbarHttpExample) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
          return;
        }
        const result = await container.formbarHttpExample.ping();
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
    async kioskEnroll(req, res, next) {
      try {
        const result = await kioskService.enroll({
          ...req.body,
          reqLike: { ...req, serverUrl: container.config.baseUrl },
        });
        res.status(201).json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },
    async kioskSession(req, res, next) {
      try {
        await regenerateSession(req, { kioskId: req.kiosk.id });
        res.json({
          data: {
            kiosk: {
              id: req.kiosk.id,
              code: req.kiosk.kiosk_code,
              name: req.kiosk.name,
              location: req.kiosk.location_name,
              type: req.kiosk.type,
            },
          },
        });
      } catch (error) {
        next(error);
      }
    },
    async kioskEnrollmentStart(req, res, next) {
      try {
        const result = await kioskService.startEnrollment(req.body);
        res.status(201).json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },
    async kioskEnrollmentStatus(req, res, next) {
      try {
        const result = await kioskService.enrollmentStatus(req.query);
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },
    async kioskEnrollmentComplete(req, res, next) {
      try {
        const result = await kioskService.completeEnrollment({ ...req.body, reqLike: req });
        res.status(201).json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },
    async kioskHeartbeat(req, res, next) {
      try {
        const now = container.clock.now();
        await passRepository.touchKiosk(req.kiosk.id, {
          last_seen: now,
          last_seen_at: now,
          software_version: req.body.softwareVersion || null,
        });
        res.json({
          data: {
            kiosk: req.kiosk.kiosk_code,
            location: req.kiosk.location_name,
            status: 'online',
            timestamp: now,
          },
        });
      } catch (error) {
        next(error);
      }
    },
    async kioskOptions(req, res, next) {
      try {
        const result = await passService.kioskOptions(req.kiosk.kiosk_code);
        res.json({ data: { kiosk: result.kiosk, destinations: result.destinations } });
      } catch (error) {
        next(error);
      }
    },
    async kioskScan(req, res, next) {
      try {
        const result = await passService.scanStudent({
          kioskCode: req.kiosk.kiosk_code,
          studentNumber: req.body.studentNumber,
          studentName: req.body.studentName,
        });
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
    async kioskRequestPass(req, res, next) {
      try {
        const result = await passService.requestPass({
          kioskCode: req.kiosk.kiosk_code,
          ...req.body,
        });
        res.status(201).json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  };
}
