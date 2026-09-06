const Booking = require("../models/booking");
const Home = require("../models/home");

// ✅ POST BOOKING / JOB APPLICATION
exports.postBooking = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user._id;
    const User = require("../models/user");
    const user = await User.findById(userId);

    if (!user) return res.redirect("/login");

    const { homeId, jobId, coverLetter, resume } = req.body;
    const targetJobId = jobId || homeId;

    const task = await Home.findById(targetJobId);
    if (!task) {
      return res.redirect("/homes");
    }

    // Check if current user is the owner/host of this task
    const taskOwnerId = (task.owner ? (task.owner._id || task.owner) : (task.host ? (task.host._id || task.host) : "")).toString();
    if (taskOwnerId && taskOwnerId === userId.toString()) {
      return res.render("store/error-notice", {
        pageTitle: "Cannot Apply to Own Task",
        status: "own_task_error",
        message: "You are the host of this task. You cannot apply for a task that you posted yourself.",
        user,
        isLoggedIn: true,
      });
    }

    // Auto-approve user if not already set
    if (user.verificationStatus !== "approved" || !user.isVerified) {
      user.verificationStatus = "approved";
      user.isVerified = true;
      await user.save();
      req.session.user = user.toObject();
    }


    // Check Job Status (Must be "approved" or "active" or default if unmodded legacy)
    const isJobActive = !task.status || task.status === "approved" || task.status === "active";
    if (!isJobActive) {
      return res.render("store/error-notice", {
        pageTitle: "Job Not Available",
        status: "job_inactive",
        message: "This job listing is currently under moderation or inactive.",
        user,
        isLoggedIn: true,
      });
    }


    // 3. Check Application Deadline
    if (task.applicationDeadline && new Date(task.applicationDeadline) < new Date()) {
      return res.render("store/error-notice", {
        pageTitle: "Deadline Passed",
        status: "deadline_passed",
        message: "The application deadline for this job listing has passed.",
        user,
        isLoggedIn: true,
      });
    }

    // 4. Check Duplicate Application (student + job)
    const existingApp = await Booking.findOne({
      $or: [
        { student: userId, job: targetJobId },
        { user: userId, home: targetJobId },
      ],
    });

    if (existingApp) {
      return res.render("store/error-notice", {
        pageTitle: "Already Applied",
        status: "duplicate_application",
        message: "You have already applied for this job.",
        user,
        isLoggedIn: true,
      });
    }

    const booking = new Booking({
      job: targetJobId,
      home: targetJobId,
      student: userId,
      user: userId,
      resume: resume || user.resume || "",
      coverLetter: coverLetter || "",
      status: "applied",
      appliedAt: new Date(),
    });

    await booking.save();

    // Create Notification for Host
    const { createNotification } = require("../utils/notificationUtil");
    if (task.host || task.owner) {
      const hostId = task.host || task.owner;
      await createNotification({
        app: req.app,
        userId: hostId,
        title: "New Job Applicant! 📩",
        message: `${user.firstName} ${user.lastName || ''} applied for your job: "${task.title || task.houseName}"`,
        type: "application_status",
        relatedJob: task._id,
        relatedApplication: booking._id,
      });
    }

    res.redirect("/bookings");
  } catch (err) {
    console.error("Task Apply Error:", err);
    res.redirect("/homes");
  }
};

// ✅ POST: Cancel Application / Booking
exports.postCancelBooking = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect('/login');
    const bookingId = req.params.id;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.redirect('/bookings');

    const appUser = booking.user || booking.student;
    if (appUser.toString() !== req.session.user._id.toString()) {
      return res.redirect('/bookings');
    }

    if (booking.status === 'Selected' || booking.status === 'selected') {
      const { applyGuestPenalty } = require('../utils/penalty');
      await applyGuestPenalty(appUser);
      return res.redirect('/bookings');
    }

    await Booking.findByIdAndDelete(bookingId);
    res.redirect('/bookings');
  } catch (err) {
    console.error('[postCancelBooking Error]', err);
    res.redirect('/bookings');
  }
};

// ✅ DELETE APPLICATION
exports.deleteBooking = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect("/login");

    const booking = await Booking.findById(req.params.id);
    const appUser = booking ? (booking.user || booking.student) : null;

    if (!booking || (appUser && appUser.toString() !== req.session.user._id.toString())) {
      return res.redirect("/bookings");
    }

    await Booking.findByIdAndDelete(req.params.id);
    res.redirect("/bookings");
  } catch (err) {
    console.error(err);
    res.redirect("/bookings");
  }
};

// ✅ POST: Release Selected Booking
exports.postReleaseBooking = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect('/login');
    const bookingId = req.params.id;
    const b = await Booking.findById(bookingId);
    const appUser = b ? (b.user || b.student) : null;

    if (b && appUser && appUser.toString() === req.session.user._id.toString() && (b.status === 'Selected' || b.status === 'selected') && b.releaseRequested) {
      b.status = 'withdrawn';
      b.releaseRequested = false;
      await b.save();
    }
    res.redirect('/bookings');
  } catch (err) {
    console.error(err);
    res.redirect('/bookings');
  }
};
