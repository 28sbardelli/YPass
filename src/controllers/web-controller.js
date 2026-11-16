export function createWebController(container) {
  const { passService, kioskService, userService } = container;
  const kioskManagerCode = container.config.kioskManagerCode;

  return {
    async translate(req, res, next) {
      try {
        const texts = req.body?.texts;
        if (
          !Array.isArray(texts) ||
          texts.length < 1 ||
          texts.length > 100 ||
          texts.some((text) => typeof text !== 'string' || text.length > 5000)
        ) {
          res.status(400).json({ error: 'texts must contain 1 to 100 strings of up to 5000 characters.' });
          return;
        }
        const translations = await container.translate.translate(texts, 'es');
        res.json({ translations });
      } catch (error) {
        next(error);
      }
    },
    home(req, res) {
      res.render('pages/home', {
        title: '主页',
        features: container.config.features,
        currentUser: req.currentUser || null,
      });
    },
    example(req, res) {
      res.render('pages/example', {
        title: '示例页面',
        socketEnabled: container.config.features.socketIo,
      });
    },
    teacher(req, res) {
      return passService.teacherDashboard(req.currentUser.id).then((dashboard) =>
        res.render('pages/teacher', {
          title: '教师面板',
          currentUser: req.currentUser,
          message: null,
          ...dashboard,
        }),
      );
    },
    async teacherAction(req, res, next) {
      try {
        const approved = req.body.action === 'approve';
        const action = approved ? passService.approvePass : passService.cancelPass;
        await action({ passId: req.body.passId, userId: req.currentUser.id });
        const dashboard = await passService.teacherDashboard(req.currentUser.id);
        res.render('pages/teacher', {
          title: '教师面板',
          currentUser: req.currentUser,
          message: approved ? 'Pass approved.' : 'Pass cancelled.',
          messageType: approved ? 'success' : 'error',
          ...dashboard,
        });
      } catch (error) {
        next(error);
      }
    },
    async appointment(req, res, next) {
      try {
        const options = await passService.appointmentOptions(req.currentUser.id);
        res.render('pages/appointment', {
          title: '创建预约',
          currentUser: req.currentUser,
          ...options,
          form: {},
          message: null,
        });
      } catch (error) {
        next(error);
      }
    },
    async appointmentStudent(req, res, next) {
      try {
        if (req.query.studentName) {
          const students = await passService.findAppointmentStudents(req.query.studentName);
          res.json({ students });
          return;
        }
        const student = await passService.findAppointmentStudent(req.query.studentNumber);
        res.json({ students: student ? [student] : [] });
      } catch (error) {
        next(error);
      }
    },
    async createAppointment(req, res, next) {
      try {
        await passService.createAppointment({ userId: req.currentUser.id, ...req.body });
        const options = await passService.appointmentOptions(req.currentUser.id);
        res.render('pages/appointment', {
          title: '创建预约',
          currentUser: req.currentUser,
          ...options,
          form: {},
          message: 'Appointment created.',
        });
      } catch (error) {
        if (!error.expose) {
          next(error);
          return;
        }
        const options = await passService.appointmentOptions(req.currentUser.id);
        res.status(error.status).render('pages/appointment', {
          title: '创建预约',
          currentUser: req.currentUser,
          ...options,
          form: req.body,
          message: error.message,
        });
      }
    },
    async kiosk(req, res, next) {
      try {
        const kioskCode = String(req.query.kiosk || 'main-office');
        const options = await passService.kioskOptions(kioskCode);
        const pendingRequest = req.session?.kioskPendingPass;
        const pending = pendingRequest
          ? await passService.kioskPendingPass({ kioskCode, ...pendingRequest })
          : null;
        if (!pending && pendingRequest) {
          delete req.session.kioskPendingPass;
        }
        renderKiosk(res, {
          kioskCode,
          ...options,
          action: pending ? 'pending' : null,
          student: pending?.student || null,
          pass: pending?.pass || null,
          form: pending
            ? {
                studentNumber: pending.student.student_number,
                studentName: pending.student.display_name,
                destinationLocationId:
                  pending.destination?.id || pending.pass.destination_location_id,
              }
            : {},
          message: pending
            ? { type: 'warning', text: 'This pass is waiting for teacher approval.' }
            : null,
        });
      } catch (error) {
        next(error);
      }
    },
    async kioskPass(req, res, next) {
      try {
        const options = await passService.kioskOptions(req.kiosk.kiosk_code);
        if (req.query.manager === '1') {
          const settings = await kioskService.settings(req.kiosk.id);
          res.render('pages/kiosk-manager', {
            title: '终端管理',
            currentUser: null,
            ...settings,
            message: null,
          });
          return;
        }
        const pendingRequest = req.session.kioskPendingPass;
        const pending = pendingRequest
          ? await passService.kioskPendingPass({
              kioskCode: req.kiosk.kiosk_code,
              ...pendingRequest,
            })
          : null;
        if (!pending && pendingRequest) {
          delete req.session.kioskPendingPass;
        }
        renderKiosk(res, {
          view: 'pages/pass',
          kioskSession: true,
          kioskCode: req.kiosk.kiosk_code,
          ...options,
          action: pending ? 'pending' : null,
          student: pending?.student || null,
          pass: pending?.pass || null,
          form: pending
            ? {
                studentNumber: pending.student.student_number,
                studentName: pending.student.display_name,
                destinationLocationId:
                  pending.destination?.id || pending.pass.destination_location_id,
              }
            : {},
          message: pending
            ? { type: 'warning', text: 'This pass is waiting for teacher approval.' }
            : null,
        });
      } catch (error) {
        next(error);
      }
    },
    async kioskManager(req, res, next) {
      try {
        const settings = await kioskService.settings(req.kiosk.id);
        res.render('pages/kiosk-manager', {
          title: '终端管理',
          currentUser: null,
          ...settings,
          message: req.query.saved ? 'Kiosk settings saved.' : null,
        });
      } catch (error) {
        next(error);
      }
    },
    async updateKioskManager(req, res, next) {
      try {
        await kioskService.updateSettings({
          kioskId: req.kiosk.id,
          name: req.body.name,
          locationId: req.body.locationId,
          teacherUserId: req.body.teacherUserId,
          reqLike: req,
        });
        res.redirect('/kiosk/manager?saved=1');
      } catch (error) {
        next(error);
      }
    },
    async kioskPassStatus(req, res, next) {
      try {
        const pendingRequest = req.session.kioskPendingPass;
        const pending = pendingRequest
          ? await passService.kioskPendingPass({
              kioskCode: req.kiosk.kiosk_code,
              ...pendingRequest,
            })
          : null;
        if (!pending && pendingRequest) delete req.session.kioskPendingPass;
        res.json({ pending: Boolean(pending) });
      } catch (error) {
        next(error);
      }
    },
    async scanKiosk(req, res, next) {
      const kioskCode = req.kiosk?.kiosk_code || req.body.kioskCode;
      const appointmentAction = req.body.appointmentAction;
      const appointmentId = req.body.appointmentId;
      if (req.body.managerAction === 'save') {
        try {
          await kioskService.updateSettings({
            kioskId: req.kiosk.id,
            name: req.body.name,
            locationId: req.body.locationId,
            teacherUserId: req.body.teacherUserId,
            reqLike: req,
          });
          const settings = await kioskService.settings(req.kiosk.id);
          res.render('pages/kiosk-manager', {
            title: '终端管理',
            currentUser: null,
            ...settings,
            message: 'Kiosk settings saved.',
          });
        } catch (error) {
          next(error);
        }
        return;
      }
      if (
        kioskManagerCode &&
        String(req.body.studentNumber || '')
          .trim()
          .toUpperCase() === kioskManagerCode.toUpperCase()
      ) {
        const settings = await kioskService.settings(req.kiosk.id);
        res.render('pages/kiosk-manager', {
          title: '终端管理',
          currentUser: null,
          ...settings,
          message: null,
        });
        return;
      }
      try {
        if (appointmentAction === 'complete' && appointmentId) {
          const result = await passService.completeAppointmentForStudent({
            kioskCode,
            studentNumber: req.body.studentNumber,
            appointmentId,
            actorUserId: req.currentUser?.id,
          });
          renderKiosk(res, {
            ...result,
            kioskCode,
            kioskSession: Boolean(req.kiosk),
            form: {},
            message: {
              type: 'success',
              text: `Appointment completed and a pass was approved for ${result.student.display_name}.`,
            },
            appointmentPrompt: false,
            appointments: [],
            appointmentChoices: [],
          });
          return;
        }
        if (appointmentAction === 'show') {
          const appointments = await passService.listUpcomingAppointments(
            req.body.studentNumber,
          );
          const student = await passService.kioskOptions(kioskCode).then(({ kiosk, destinations }) => ({
            kiosk,
            destinations,
            student: { display_name: req.body.studentName || 'Student' },
          }));
          renderKiosk(res, {
            kiosk: student.kiosk,
            destinations: student.destinations,
            student: student.student,
            kioskCode,
            kioskSession: Boolean(req.kiosk),
            form: { studentNumber: req.body.studentNumber },
            message: {
              type: 'info',
              text: 'Choose the appointment you want to complete now.',
            },
            appointmentPrompt: false,
            appointmentChoices: appointments,
          });
          return;
        }
        const result = await passService.scanStudent({
          kioskCode,
          studentNumber: req.body.studentNumber,
          actorUserId: req.currentUser?.id,
        });
        if (appointmentAction === 'decline') {
          result.appointmentPrompt = false;
          result.appointments = [];
        }
        const message = scanMessage(result);
        renderKiosk(res, {
          ...result,
          kioskCode,
          kioskSession: Boolean(req.kiosk),
          form: {},
          message,
        });
      } catch (error) {
        if (!error.expose) {
          next(error);
          return;
        }
        try {
          const options = await passService.kioskOptions(kioskCode);
          renderKiosk(
            res,
            {
              ...options,
              kioskCode,
              kioskSession: Boolean(req.kiosk),
              form: req.body,
              message: { type: 'error', text: error.message },
            },
            error.status,
          );
        } catch (renderError) {
          next(renderError);
        }
      }
    },
    async createKioskPass(req, res, next) {
      const kioskCode = req.kiosk?.kiosk_code || req.body.kioskCode;
      try {
        const pendingRequest = req.session?.kioskPendingPass;
        if (pendingRequest) {
          const pending = await passService.kioskPendingPass({ kioskCode, ...pendingRequest });
          if (pending) {
            renderKiosk(res, {
              ...pending,
              action: 'pending',
              kioskCode,
              kioskSession: Boolean(req.kiosk),
              form: {
                studentNumber: pending.student.student_number,
                studentName: pending.student.display_name,
                destinationLocationId:
                  pending.destination?.id || pending.pass.destination_location_id,
              },
              message: { type: 'warning', text: 'This pass is waiting for teacher approval.' },
            });
            return;
          }
          delete req.session.kioskPendingPass;
        }
        const result = await passService.requestPass({
          kioskCode,
          studentNumber: req.body.studentNumber,
          studentName: req.body.studentName,
          destinationLocationId: req.body.destinationLocationId,
          actorUserId: req.currentUser?.id,
        });
        if (result.pass.status === 'pending_approval' && req.session) {
          req.session.kioskPendingPass = {
            passId: result.pass.id,
            studentNumber: result.student.student_number,
          };
        }
        renderKiosk(res, {
          ...result,
          kioskCode,
          kioskSession: Boolean(req.kiosk),
          form: {},
          message: {
            type: 'success',
            text: `Pass requested for ${result.student.display_name}. A teacher must approve it before departure.`,
          },
        });
      } catch (error) {
        if (!error.expose) {
          next(error);
          return;
        }
        try {
          const options = await passService.kioskOptions(kioskCode);
          renderKiosk(
            res,
            {
              ...options,
              kioskCode,
              kioskSession: Boolean(req.kiosk),
              student: { display_name: req.body.studentName },
              form: req.body,
              message: { type: 'error', text: error.message },
            },
            error.status,
          );
        } catch (renderError) {
          next(renderError);
        }
      }
    },
    async manager(req, res, next) {
      try {
        const manager = await passService.managerDashboard(req.query);
        const enrollmentCodes = await kioskService.listEnrollmentCodes();
        const sisConnections = container.config.features.sis
          ? await container.sisRepository.listConnections()
          : [];
        res.render('pages/manager', {
          title: '管理面板',
          currentUser: req.currentUser,
          ...manager,
          enrollmentCodes,
          enrollmentCode: req.query.enrollmentCode || null,
          sisConnections,
          sisEnabled: container.config.features.sis,
        });
      } catch (error) {
        next(error);
      }
    },
    async createManagerStudent(req, res, next) {
      return managerMutation(req, res, next, () => passService.createManagerStudent(req.body));
    },
    async updateManagerStudent(req, res, next) {
      return managerMutation(req, res, next, () => passService.updateManagerStudent(req.body));
    },
    async deleteManagerStudent(req, res, next) {
      return managerMutation(req, res, next, () => passService.deleteManagerStudent(req.body));
    },
    async createManagerLocation(req, res, next) {
      return managerMutation(req, res, next, () => passService.createManagerLocation(req.body));
    },
    async updateManagerLocation(req, res, next) {
      return managerMutation(req, res, next, () => passService.updateManagerLocation(req.body));
    },
    async deleteManagerLocation(req, res, next) {
      return managerMutation(req, res, next, () => passService.deleteManagerLocation(req.body));
    },
    async createManagerKiosk(req, res, next) {
      return managerMutation(req, res, next, () => passService.createManagerKiosk(req.body));
    },
    async updateManagerKiosk(req, res, next) {
      return managerMutation(req, res, next, () => passService.updateManagerKiosk(req.body));
    },
    async deleteManagerKiosk(req, res, next) {
      return managerMutation(req, res, next, () => passService.deleteManagerKiosk(req.body));
    },
    async updateManagerUserRole(req, res, next) {
      return managerMutation(req, res, next, () => userService.assignRole(req.body, req));
    },
    async createManagerEnrollmentCode(req, res, next) {
      try {
        const result = await kioskService.createEnrollmentCode({
          createdBy: req.currentUser.id,
          ...req.body,
          reqLike: req,
        });
        res.redirect(managerRedirectPath(req, { enrollmentCode: result.code }));
      } catch (error) {
        next(error);
      }
    },
    async completeManagerEnrollment(req, res, next) {
      try {
        await kioskService.completeEnrollment({ ...req.body, reqLike: req });
        res.redirect(managerRedirectPath(req));
      } catch (error) {
        next(error);
      }
    },
    async regenerateManagerKioskCredentials(req, res, next) {
      try {
        const result = await kioskService.createCredentialRegenerationCode({
          createdBy: req.currentUser.id,
          kioskId: req.body.kioskId,
          reqLike: req,
        });
        res.redirect(managerRedirectPath(req, { enrollmentCode: result.code }));
      } catch (error) {
        next(error);
      }
    },
  };

  async function managerMutation(req, res, next, action) {
    try {
      await action();
      res.redirect(managerRedirectPath(req));
    } catch (error) {
      next(error);
    }
  }

  function managerRedirectPath(req, extra = {}) {
    const params = new URLSearchParams();
    let valueCount = 0;

    for (const [key, value] of Object.entries(req.query || {})) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(key) || key === '_csrf') continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        if (valueCount >= 32) break;
        if (typeof item !== 'string' || item.length > 256) continue;
        params.append(key, item);
        valueCount += 1;
      }
    }

    for (const [key, value] of Object.entries(extra)) {
      if (/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(key) && typeof value === 'string') {
        params.set(key, value);
      }
    }

    const query = params.toString();
    return query ? `/manager?${query}` : '/manager';
  }

  function renderKiosk(res, data, status = 200) {
    const { view = 'pages/kiosk', ...viewData } = data;
    res.status(status).render(view, {
      title: 'Student Pass Kiosk',
      hideSiteChrome: true,
      currentUser: res.req.currentUser || null,
      action: null,
    pass: null,
    student: null,
    destinations: [],
    kiosk: null,
    form: {},
    message: null,
    kioskSession: false,
    appointmentPrompt: false,
    appointments: [],
    appointmentChoices: [],
    ...viewData,
  });
  }
}

function scanMessage(result) {
  if (result.action === 'create') {
    return { type: 'info', text: `Welcome, ${result.student.display_name}. Choose a destination.` };
  }
  if (result.action === 'pending') {
    return { type: 'warning', text: 'This student has a pass waiting for teacher approval.' };
  }
  if (result.action === 'arrival') {
    return { type: 'success', text: `Arrival recorded for ${result.student.display_name}.` };
  }
  if (result.action === 'scan_out') {
    return { type: 'info', text: `${result.student.display_name} has left the destination.` };
  }
  return { type: 'success', text: `Pass ended for ${result.student.display_name}.` };
}
