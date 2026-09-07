const Home = require("../models/home");
const User = require("../models/user");
const Booking = require("../models/booking");

exports.getIndex = async (req, res, next) => {
  try {
    const registeredHomes = await Home.find().sort({ createdAt: -1 });
    let dbUser = null;
    if (req.session && req.session.user && req.session.user._id) {
      dbUser = await User.findById(req.session.user._id);
    }
    res.render("store/index", {
      registeredHomes: registeredHomes,
      pageTitle: "Campus Micro Job Portal",
      currentPage: "index",
      isLoggedIn: req.session.isLoggedIn || false,
      user: dbUser || req.session.user || null,
    });
  } catch (err) {
    console.error("[getIndex Error]", err);
    res.redirect("/homes");
  }
};

exports.getHomes = async (req, res, next) => {
  try {
    const registeredHomes = await Home.find().sort({ createdAt: -1 });
    let dbUser = null;
    if (req.session && req.session.user && req.session.user._id) {
      dbUser = await User.findById(req.session.user._id);
    }
    res.render("store/home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Campus Tasks Directory",
      currentPage: "Home",
      isLoggedIn: req.session.isLoggedIn || false,
      user: dbUser || req.session.user || null,
    });
  } catch (err) {
    console.error("[getHomes Error]", err);
    res.redirect("/");
  }
};



exports.getFavouriteList = async (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect("/login");
    }
    const userId = req.session.user._id;
    const user = await User.findById(userId).populate("favourites");
    const validFavourites = user && user.favourites ? user.favourites.filter(item => item !== null) : [];
    
    // Update session user to stay in sync
    if (user) req.session.user = user.toObject();

    res.render("store/favourite-list", {
      favouriteHomes: validFavourites,
      pageTitle: "Saved Tasks",
      currentPage: "favourites",
      isLoggedIn: req.session.isLoggedIn || false,
      user: user || req.session.user || null,
    });
  } catch (err) {
    console.error("[getFavouriteList Error]", err);
    res.redirect("/homes");
  }
};

exports.postAddToFavourite = async (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(401).json({ success: false, message: "Please login to save tasks." });
      }
      return res.redirect("/login");
    }
    const homeId = req.body.id || req.body.homeId;
    const userId = req.session.user._id;
    const user = await User.findById(userId);

    if (user && homeId) {
      const exists = user.favourites.some(fav => fav && fav.toString() === homeId.toString());
      if (!exists) {
        user.favourites.push(homeId);
        await user.save();
      }
      req.session.user = user.toObject();
    }

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, isSaved: true });
    }
    res.redirect("/favourites");
  } catch (err) {
    console.error("[postAddToFavourite Error]", err);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect("/favourites");
  }
};

exports.postRemoveFromFavourite = async (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(401).json({ success: false, message: "Please login." });
      }
      return res.redirect("/login");
    }
    const homeId = req.params.homeId || req.body.id || req.body.homeId;
    const userId = req.session.user._id;
    const user = await User.findById(userId);

    if (user && homeId) {
      user.favourites = user.favourites.filter(fav => fav && fav.toString() !== homeId.toString());
      await user.save();
      req.session.user = user.toObject();
    }

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, isSaved: false });
    }
    res.redirect("/favourites");
  } catch (err) {
    console.error("[postRemoveFromFavourite Error]", err);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect("/favourites");
  }
};



exports.getHomeDetails = (req, res, next) => {
  const homeId = req.params.homeId;
  Home.findById(homeId).then((home) => {
    // const home = homes[0];
    if (!home) {
      console.log("Home not found");
      res.redirect("/homes");
    } else {
      res.render("store/home-details", {
        home: home,
        pageTitle: "Home Detail",
        currentPage: "Home",
        isLoggedIn: req.session.isLoggedIn || false,
        user: req.session.user || null,
      });
    }
  });
};

exports.getBookings = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const Message = require("../models/message");
  
  let bookings = await Booking.find({
    user: req.session.user._id,
  }).populate("home").lean();

  bookings = await Promise.all(bookings.map(async (booking) => {
    const unreadCount = await Message.countDocuments({ booking: booking._id, recipient: req.session.user._id, read: false });
    return { ...booking, unreadCount };
  }));

  res.render("store/bookings", {
    pageTitle: "My Applications",
    currentPage: "bookings",
    bookings: bookings,
    isLoggedIn: req.session.isLoggedIn || true,
    user: req.session.user,
  });
};
