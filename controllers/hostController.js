const Home = require("../models/home");
const Booking = require("../models/booking");
const { applyHostPenalty } = require('../utils/penalty');
// ─── Helper: check if logged-in host owns the task ───────────────────────────
const isOwner = (home, userId) => {
  return home.owner && home.owner.toString() === userId.toString();
};

// ─── GET: Add Home form ───────────────────────────────────────────────────────
exports.getAddHome = (req, res, next) => {
  res.render("host/edithome", {
    pageTitle: "Add jobs to platform",
    currentPage: "addHome",
    editing: false,
    isLoggedIn: req.session.isLoggedIn || false,
    user: req.session.user || null,
    home: {},
    errorMessage: null,
  });
};

// ─── GET: Home Added success ─────────────────────────────────────────────────
exports.getHomeAdded = (req, res, next) => {
  res.render("host/home-added", {
    pageTitle: "Task Posted",
    currentPage: "addHome",
    isLoggedIn: req.session.isLoggedIn || false,
    user: req.session.user || null,
  });
};

// ─── GET: Edit Home form ──────────────────────────────────────────────────────
exports.getEditHome = (req, res, next) => {
  const homeId = req.params.homeId;
  const editing = req.query.editing === "true";
  const hostId = req.session.user._id;

  Home.findById(homeId).then((home) => {
    if (!home) {
      return res.redirect("/host-home-list");
    }

    // 🔒 Ownership check — only the task's creator can edit
    if (!isOwner(home, hostId)) {
      console.log("Unauthorized edit attempt by host:", hostId);
      return res.redirect("/host-home-list");
    }

    res.render("host/edithome", {
      home: home,
      pageTitle: "Edit your home",
      currentPage: "host-homes",
      editing: editing,
      isLoggedIn: req.session.isLoggedIn || false,
      user: req.session.user || null,
      errorMessage: null,
    });
  }).catch((err) => {
    console.error("[getEditHome Error]", err);
    res.redirect("/host-home-list");
  });
};

// ─── GET: Host's own task list ────────────────────────────────────────────────
exports.getHostHomes = async (req, res, next) => {
  try {
    const hostId = req.session.user._id;

    // 🔒 ONLY show tasks that THIS host owns — match either owner or host field
    const registeredHomes = await Home.find({
      $or: [{ owner: hostId }, { host: hostId }]
    }).sort({ createdAt: -1 });

    const Message = require("../models/message");

    // Fetch all bookings per task and populate student info
    const homesWithBookings = await Promise.all(
      registeredHomes.map(async (home) => {
        let bookings = await Booking.find({ home: home._id }).populate(
          "user",
          "firstName lastName email expectedPrice distance completedTasks location"
        ).lean();
        
        bookings = await Promise.all(bookings.map(async (booking) => {
          const unreadCount = await Message.countDocuments({ booking: booking._id, recipient: hostId, read: false });
          return { ...booking, unreadCount };
        }));

        return { ...home.toObject(), bookings };
      })
    );

    res.render("host/host-home-list", {
      registeredHomes: homesWithBookings,
      pageTitle: "Host Task Dashboard",
      currentPage: "host-homes",
      isLoggedIn: req.session.isLoggedIn || false,
      user: req.session.user || null,
    });
  } catch (err) {
    console.error("[getHostHomes Error]", err);
    res.redirect("/");
  }
};

// ─── POST: Add Home / Job ───────────────────────────────────────────────────
exports.postAddHome = (req, res, next) => {
  const {
    houseName, title, price, stipend, location, rating, description, maxguest, propertytype,
    category, requiredSkills, jobType, duration, numberOfPositions, applicationDeadline
  } = req.body;

  // Separate uploaded files into images and other attachments
  const files = req.files || [];
  const imageFiles = files.filter(f => f.mimetype && f.mimetype.startsWith("image/"));
  const otherFiles = files.filter(f => !f.mimetype || !f.mimetype.startsWith("image/"));

  const photos = imageFiles.map(f => f.path);
  const attachments = otherFiles.map(f => ({
    url:  f.path,
    name: f.originalname,
    type: f.mimetype,
  }));

  // Fallback cover image if no images uploaded
  const defaultPhoto = "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=1200";
  const photo = photos[0] || defaultPhoto;

  const parsedSkills = typeof requiredSkills === "string"
    ? requiredSkills.split(",").map(s => s.trim()).filter(Boolean)
    : (Array.isArray(requiredSkills) ? requiredSkills : []);

  // Validate jobType against Mongoose schema enum: ["Part-Time", "Full-Time", "Project-Based", "Gig", "Internship"]
  const validJobTypes = ["Part-Time", "Full-Time", "Project-Based", "Gig", "Internship"];
  const safeJobType = validJobTypes.includes(jobType) ? jobType : "Part-Time";

  // Auto-approve task for verified hosts
  const hostUser = req.session.user;
  const isVerifiedHost = hostUser && (hostUser.isHostVerified || hostUser.hostVerificationStatus === "approved");
  const initialStatus = isVerifiedHost ? "approved" : "pending";

  const home = new Home({
    title: title || houseName || "Campus Micro Job",
    houseName: houseName || title || "Campus Micro Job",
    price: Number(price || stipend || 0),
    stipend: Number(stipend || price || 0),
    location: location || "Parul University Campus",
    rating: Number(rating) || 5,
    photo,           // first image (card thumbnail)
    photos,          // all images
    attachments,     // all non-image files
    description: description || "No description provided.",
    maxguest: Number(maxguest || numberOfPositions || 1),
    numberOfPositions: Number(numberOfPositions || maxguest || 1),
    propertytype: propertytype || safeJobType || "Task",
    category: category || "General",
    requiredSkills: parsedSkills,
    jobType: safeJobType,
    duration: duration || "Flexible",
    applicationDeadline: applicationDeadline ? new Date(applicationDeadline) : null,
    host: hostUser._id,
    owner: hostUser._id,
    status: initialStatus,
  });

  home.save().then(() => {
    console.log(`Job Saved Successfully with status: ${initialStatus}`);
    res.redirect("/home-added");
  }).catch((err) => {
    console.error("[postAddHome Error]", err);
    res.redirect("/host-home-list");
  });
};


// ─── POST: Edit Home ──────────────────────────────────────────────────────────
exports.postEditHome = (req, res, next) => {
  const {
    id, houseName, price, location, rating, description, maxguest, propertytype,
  } = req.body;
  const hostId = req.session.user._id;

  Home.findById(id)
    .then((home) => {
      if (!home) return res.redirect("/host-home-list");

      // 🔒 Ownership check
      if (!isOwner(home, hostId)) {
        console.log("Unauthorized postEditHome attempt by host:", hostId);
        return res.redirect("/host-home-list");
      }

      home.houseName   = houseName;
      home.price       = price;
      home.location    = location;
      home.rating      = rating;
      home.description = description;
      home.maxguest    = maxguest;
      home.propertytype = propertytype;

      // Handle newly uploaded files
      const files = req.files || [];
      if (files.length > 0) {
        const imageFiles = files.filter(f => f.mimetype.startsWith("image/"));
        const otherFiles = files.filter(f => !f.mimetype.startsWith("image/"));

        const newPhotos = imageFiles.map(f => f.path);
        const newAttachments = otherFiles.map(f => ({
          url: f.path, name: f.originalname, type: f.mimetype,
        }));

        // Merge with existing (append new files)
        home.photos = [...(home.photos || []), ...newPhotos];
        home.attachments = [...(home.attachments || []), ...newAttachments];

        // Update cover photo if a new image was uploaded
        if (newPhotos.length > 0) home.photo = newPhotos[0];
      }

      return home.save().then(() => {
        console.log("Home updated");
        res.redirect("/host-home-list");
      });
    })
    .catch((err) => {
      console.error("[postEditHome Error]", err);
      res.redirect("/host-home-list");
    });
};


// ─── POST: Delete Home ────────────────────────────────────────────────────────
exports.postDeleteHome = async (req, res, next) => {
  try {
    const homeId = req.params.homeId;
    const hostId = req.session.user._id;

    const home = await Home.findById(homeId);
    if (!home) return res.redirect("/host-home-list");

    // 🔒 Ownership check
    if (!isOwner(home, hostId)) {
      console.log("Unauthorized postDeleteHome attempt by host:", hostId);
      return res.redirect("/host-home-list");
    }

    await Booking.deleteMany({ home: homeId });
    await Home.findByIdAndDelete(homeId);
    console.log("Home deleted:", homeId);
    res.redirect("/host-home-list");
  } catch (err) {
    console.error("[postDeleteHome Error]", err);
    res.redirect("/host-home-list");
  }
};

// ─── POST: Complete Home ──────────────────────────────────────────────────────
exports.postCompleteHome = async (req, res, next) => {
  try {
    if (!req.session.user) return res.redirect("/login");

    const homeId = req.params.homeId;
    const hostId = req.session.user._id;
    const User = require("../models/user");

    const home = await Home.findById(homeId);
    if (!home) return res.redirect("/host-home-list");

    // 🔒 Ownership check
    if (!isOwner(home, hostId)) {
      console.log("Unauthorized postCompleteHome attempt by host:", hostId);
      return res.redirect("/host-home-list");
    }

    // Increment completedTasks for the selected (hired) student
    const selectedBooking = await Booking.findOne({ home: homeId, status: "Selected" });
    if (selectedBooking) {
      await User.findByIdAndUpdate(selectedBooking.user, { $inc: { completedTasks: 1 } });
      console.log(`Incremented completedTasks for student ${selectedBooking.user}`);
    }

    await Booking.deleteMany({ home: homeId });
    await Home.findByIdAndDelete(homeId);
    console.log("Task completed and removed:", homeId);
    res.redirect("/host-home-list");
  } catch (err) {
    console.error("[postCompleteHome Error]", err);
    res.redirect("/host-home-list");
  }
};

// ─── POST: Select Booking ─────────────────────────────────────────────────────

exports.postSelectBooking = async (req, res, next) => {
  try {
    if (!req.session.user) return res.redirect('/login');

    const bookingId = req.params.bookingId;
    const hostId = req.session.user._id;

    const bookingToSelect = await Booking.findById(bookingId).populate('home');
    if (!bookingToSelect) return res.redirect('/host-home-list');

    // Properly extract home document (handling populated object vs ObjectId)
    const home = bookingToSelect.home && bookingToSelect.home._id ? bookingToSelect.home : await Home.findById(bookingToSelect.home);
    if (!home) return res.redirect('/host-home-list');

    const homeId = home._id;

    if (!isOwner(home, hostId)) {
      console.log('Unauthorized postSelectBooking attempt by host:', hostId);
      return res.redirect('/host-home-list');
    }

    // Check if another guest is already selected for this home
    const existingSelected = await Booking.findOne({
      home: homeId,
      _id: { $ne: bookingId },
      status: { $in: ['Selected', 'selected'] }
    });

    if (existingSelected) {
      if (existingSelected.releaseRequested) {
        return res.redirect('/host-home-list');
      }
      // Host is trying to select another guest – apply penalty and ask current guest to release
      await applyHostPenalty(hostId);
      existingSelected.releaseRequested = true;
      await existingSelected.save();
      return res.redirect('/host-home-list');
    }

    bookingToSelect.status = 'Selected';
    await bookingToSelect.save();

    // 1. Send In-App Notification
    const { createNotification } = require('../utils/notificationUtil');
    await createNotification({
      app: req.app,
      userId: bookingToSelect.user,
      title: "🎉 Congratulations! You are Hired!",
      message: `Great news! The host of "${home.title || home.houseName}" has officially hired you for this task. Check your chat to coordinate details!`,
      type: "application_status",
      relatedJob: homeId,
      relatedApplication: bookingToSelect._id,
    });

    // 2. Auto-send Congratulatory Message in Chat
    const Message = require('../models/message');
    try {
      const existingMsg = await Message.findOne({
        booking: bookingToSelect._id,
        content: { $regex: /congratulations/i }
      });
      if (!existingMsg) {
        await Message.create({
          booking: bookingToSelect._id,
          sender: hostId,
          recipient: bookingToSelect.user,
          content: `🎉 Congratulations! I have officially hired you for "${home.title || home.houseName}". Let's chat here to coordinate the details!`,
          read: false,
        });
      }
    } catch (msgErr) {
      console.error("[postSelectBooking Message Creation Error]", msgErr);
    }

    await Booking.updateMany(
      { home: homeId, _id: { $ne: bookingId }, status: { $nin: ['Completed', 'completed'] } },
      { $set: { status: 'Applied' } }
    );

    res.redirect('/host-home-list');
  } catch (err) {
    console.error('[postSelectBooking Error]', err);
    res.redirect('/host-home-list');
  }
};


// ─── POST: Shortlist Applicant ──────────────────────────────────────────────
exports.postShortlistApplicant = async (req, res) => {
  try {
    const applicationId = req.params.id;
    const hostId = req.session.user._id;
    const { createNotification } = require('../utils/notificationUtil');

    const appDoc = await Booking.findById(applicationId).populate('home');
    if (!appDoc) return res.redirect('/host-home-list');

    if (!appDoc.home || (appDoc.home.owner && appDoc.home.owner.toString() !== hostId.toString() && appDoc.home.host && appDoc.home.host.toString() !== hostId.toString())) {
      console.log('Unauthorized host attempt to shortlist application');
      return res.redirect('/host-home-list');
    }

    appDoc.status = 'shortlisted';
    await appDoc.save();

    await createNotification({
      app: req.app,
      userId: appDoc.user || appDoc.student,
      title: "Application Shortlisted 🌟",
      message: `Your application for "${appDoc.home.title || appDoc.home.houseName}" has been shortlisted by the host!`,
      type: "application_status",
      relatedJob: appDoc.home._id,
      relatedApplication: appDoc._id,
    });

    res.redirect('/host-home-list');
  } catch (err) {
    console.error('[postShortlistApplicant Error]', err);
    res.redirect('/host-home-list');
  }
};

// ─── POST: Schedule Interview ───────────────────────────────────────────────
exports.postScheduleInterview = async (req, res) => {
  try {
    const applicationId = req.params.id;
    const hostId = req.session.user._id;
    const { date, time, location, notes } = req.body;
    const { createNotification } = require('../utils/notificationUtil');

    const appDoc = await Booking.findById(applicationId).populate('home');
    if (!appDoc) return res.redirect('/host-home-list');

    if (!appDoc.home || (appDoc.home.owner && appDoc.home.owner.toString() !== hostId.toString() && appDoc.home.host && appDoc.home.host.toString() !== hostId.toString())) {
      return res.redirect('/host-home-list');
    }

    appDoc.status = 'interview';
    appDoc.interviewDetails = {
      date: date ? new Date(date) : new Date(),
      time: time || '10:00 AM',
      location: location || 'Parul University Campus',
      notes: notes || '',
    };
    await appDoc.save();

    await createNotification({
      app: req.app,
      userId: appDoc.user || appDoc.student,
      title: "Interview Scheduled 📅",
      message: `An interview has been scheduled for "${appDoc.home.title || appDoc.home.houseName}" on ${date || 'upcoming date'} at ${time || 'scheduled time'}.`,
      type: "interview_scheduled",
      relatedJob: appDoc.home._id,
      relatedApplication: appDoc._id,
    });

    res.redirect('/host-home-list');
  } catch (err) {
    console.error('[postScheduleInterview Error]', err);
    res.redirect('/host-home-list');
  }
};

// ─── POST: Reject Applicant ──────────────────────────────────────────────────
exports.postRejectApplicant = async (req, res) => {
  try {
    const applicationId = req.params.id;
    const hostId = req.session.user._id;
    const { createNotification } = require('../utils/notificationUtil');

    const appDoc = await Booking.findById(applicationId).populate('home');
    if (!appDoc) return res.redirect('/host-home-list');

    if (!appDoc.home || (appDoc.home.owner && appDoc.home.owner.toString() !== hostId.toString() && appDoc.home.host && appDoc.home.host.toString() !== hostId.toString())) {
      return res.redirect('/host-home-list');
    }

    appDoc.status = 'rejected';
    await appDoc.save();

    await createNotification({
      app: req.app,
      userId: appDoc.user || appDoc.student,
      title: "Application Status Update",
      message: `Your application for "${appDoc.home.title || appDoc.home.houseName}" was not selected at this time.`,
      type: "application_status",
      relatedJob: appDoc.home._id,
      relatedApplication: appDoc._id,
    });

    res.redirect('/host-home-list');
  } catch (err) {
    console.error('[postRejectApplicant Error]', err);
    res.redirect('/host-home-list');
  }
};
