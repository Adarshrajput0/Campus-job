const Home = require("../models/home");
const Booking = require("../models/booking");

exports.getAddHome = (req, res, next) => {
  res.render("host/edithome", {
    pageTitle: "Add jobs to platform",
    currentPage: "addHome",
    editing: false,
    isLoggedIn: req.isLoggedIn,
    user: req.session.user,
    home: {},
    errorMessage: null
  });
};

exports.getEditHome = (req, res, next) => {
  const homeId = req.params.homeId;
  console.log("RAW ID FROM URL:", homeId);
  console.log("TYPE:", typeof homeId);
  const editing = req.query.editing === "true";
  console.log("EDIT ID FROM URL:", homeId);

  Home.findById(homeId).then((home) => {
    console.log("HOME FOUND:", home);
    if (!home) {
      console.log("Home not found for editing!");
      return res.redirect("/host-home-list");
    }
    console.log(homeId, editing, home);
    res.render("host/edithome", {
      home: home,
      pageTitle: "Edit your home",
      currentPage: "host-homes",
      editing: editing,
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
      errorMessage: null
    });
  });
};

exports.getHostHomes = async (req, res, next) => {
  try {
    const hostId = req.session.user._id;

    // Show tasks owned by this host OR legacy tasks with no owner set yet
    const registeredHomes = await Home.find({
      $or: [
        { owner: hostId },
        { owner: { $exists: false } },
        { owner: null },
      ],
    });

    // For each task, fetch all bookings and populate student info
    const homesWithBookings = await Promise.all(
      registeredHomes.map(async (home) => {
        const bookings = await Booking.find({ home: home._id }).populate(
          "user",
          "firstName lastName email expectedPrice distance completedTasks location"
        );
        return { ...home.toObject(), bookings };
      })
    );

    res.render("host/host-home-list", {
      registeredHomes: homesWithBookings,
      pageTitle: "Host Task Dashboard",
      currentPage: "host-homes",
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
    });
  } catch (err) {
    console.error("[getHostHomes Error]", err);
    res.redirect("/");
  }
};

exports.postAddHome = (req, res, next) => {
  const {
    houseName,
    price,
    location,
    rating,
    description,
    maxguest,
    propertytype,
  } = req.body;

  if (req.fileValidationError) {
    return res.status(422).render("host/edithome", {
      pageTitle: "Add jobs to platform",
      currentPage: "addHome",
      editing: false,
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
      home: req.body,
      errorMessage: req.fileValidationError
    });
  }

  const photo = req.file ? req.file.path : "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=1200";

  const home = new Home({
    houseName,
    price,
    location,
    rating,
    photo,
    description,
    maxguest,
    propertytype,
    owner: req.session.user._id, // ✅ Save host as owner
  });
  home.save().then(() => {
    console.log("Home Saved Sucessfully");
  });

  res.redirect("/host-home-list");
};

exports.postEditHome = (req, res, next) => {
  const {
    id,
    houseName,
    price,
    location,
    rating,
    description,
    maxguest,
    propertytype,
  } = req.body;
  if (req.fileValidationError) {
    return res.status(422).render("host/edithome", {
      pageTitle: "Edit your home",
      currentPage: "host-homes",
      editing: true,
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
      home: {
        _id: id,
        houseName,
        price,
        location,
        rating,
        description,
        maxguest,
        propertytype
      },
      errorMessage: req.fileValidationError
    });
  }

  Home.findById(id)
    .then((home) => {
      home.houseName = houseName;
      home.price = price;
      home.location = location;
      home.rating = rating;
      home.description = description;
      home.maxguest = maxguest;
      home.propertytype = propertytype;

      if (req.file) {
        home.photo = req.file.path;
      }

      home
        .save()
        .then((result) => {
          console.log("Home updated", result);
        })
        .catch((err) => {
          console.log("Error while updating", err);
        });
      res.redirect("/host-home-list");
    })
    .catch((err) => {
      console.log("Error while updating", err);
    });
};

exports.postDeleteHome = (req, res, next) => {
  const homeId = req.params.homeId;
  console.log("Came to delete ", homeId);
  Home.findByIdAndDelete(homeId)
    .then(() => {
      res.redirect("/host-home-list");
    })
    .catch((error) => {
      console.log("Error while deleting ", error);
    });
};

exports.postCompleteHome = async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }
    const homeId = req.params.homeId;
    console.log("Marking home completed: ", homeId);

    const User = require("../models/user");
    
    // 1. Find if there is a selected booking (hired student) for this task
    const selectedBooking = await Booking.findOne({ home: homeId, status: "Selected" });
    if (selectedBooking) {
      // 2. Increment completedTasks count for that student
      const studentId = selectedBooking.user;
      await User.findByIdAndUpdate(studentId, { $inc: { completedTasks: 1 } });
      console.log(`Incremented completedTasks for student ${studentId}`);
    }

    // 3. Delete all associated bookings/applicants
    await Booking.deleteMany({ home: homeId });

    // 4. Delete the task (Home)
    await Home.findByIdAndDelete(homeId);

    res.redirect("/host-home-list");
  } catch (err) {
    console.error("[postCompleteHome Error]", err);
    res.redirect("/host-home-list");
  }
};

exports.postSelectBooking = async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }
    const bookingId = req.params.bookingId;
    console.log("Came to select booking: ", bookingId);

    // Find the booking we want to select
    const bookingToSelect = await Booking.findById(bookingId);
    if (!bookingToSelect) {
      console.log("Booking not found");
      return res.redirect("/host-home-list");
    }

    // Change status of the selected booking to "Selected"
    bookingToSelect.status = "Selected";
    await bookingToSelect.save();

    // Reset status of all other bookings for the same home to "Applied"
    await Booking.updateMany(
      { home: bookingToSelect.home, _id: { $ne: bookingId } },
      { $set: { status: "Applied" } }
    );

    res.redirect("/host-home-list");
  } catch (err) {
    console.error("[postSelectBooking Error]", err);
    res.redirect("/host-home-list");
  }
};
