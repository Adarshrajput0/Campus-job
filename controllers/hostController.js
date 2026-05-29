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

    // 🔒 ONLY show tasks that THIS host owns — no more legacy/ownerless tasks
    const registeredHomes = await Home.find({ owner: hostId });

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

// ─── POST: Add Home ───────────────────────────────────────────────────────────
exports.postAddHome = (req, res, next) => {
  const {
    houseName, price, location, rating, description, maxguest, propertytype,
  } = req.body;

  // Separate uploaded files into images and other attachments
  const files = req.files || [];
  const imageFiles = files.filter(f => f.mimetype.startsWith("image/"));
  const otherFiles = files.filter(f => !f.mimetype.startsWith("image/"));

  const photos = imageFiles.map(f => f.path);
  const attachments = otherFiles.map(f => ({
    url:  f.path,
    name: f.originalname,
    type: f.mimetype,
  }));

  // Fallback cover image if no images uploaded
  const defaultPhoto = "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=1200";
  const photo = photos[0] || defaultPhoto;

  const home = new Home({
    houseName, price, location, rating,
    photo,           // first image (card thumbnail)
    photos,          // all images
    attachments,     // all non-image files
    description, maxguest, propertytype,
    owner: req.session.user._id,
  });

  home.save().then(() => {
    console.log("Home Saved Successfully");
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

    const home = await Home.findById(bookingToSelect.home);
    if (!home || !isOwner(home, hostId)) {
      console.log('Unauthorized postSelectBooking attempt by host:', hostId);
      return res.redirect('/host-home-list');
    }

    // Check if a guest is already selected for this home
    const existingSelected = await Booking.findOne({ home: bookingToSelect.home, status: 'Selected' });
    if (existingSelected && existingSelected._id.toString() !== bookingId) {
      if (existingSelected.releaseRequested) {
        // We already asked them, just redirect
        return res.redirect('/host-home-list');
      }
      
      // Host is trying to select another guest – apply penalty and ask current guest to release
      await applyHostPenalty(hostId);
      existingSelected.releaseRequested = true;
      await existingSelected.save();
      
      // Keep the original selection unchanged until the guest approves
      return res.redirect('/host-home-list');
    }

    bookingToSelect.status = 'Selected';
    await bookingToSelect.save();

    await Booking.updateMany(
      { home: bookingToSelect.home, _id: { $ne: bookingId } },
      { $set: { status: 'Applied' } }
    );

    res.redirect('/host-home-list');
  } catch (err) {
    console.error('[postSelectBooking Error]', err);
    res.redirect('/host-home-list');
  }
};
