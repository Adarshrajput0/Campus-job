const Home = require("../models/home");
const User = require("../models/user");
const Booking = require("../models/booking");

exports.getIndex = (req, res, next) => {
  console.log("Session value:", req.session);
  Home.find().then((registeredHomes) => {
    res.render("store/index", {
      registeredHomes: registeredHomes,
      pageTitle: "campus jobs",
      currentPage: "index",
      isLoggedIn: req.session.isLoggedIn || false,
      user: req.session.user || null,
    });
  });
};
exports.getHomes = (req, res, next) => {
  Home.find().then((registeredHomes) => {
    res.render("store/home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Homes List",
      currentPage: "Home",
      isLoggedIn: req.session.isLoggedIn || false,
      user: req.session.user || null,
    });
  });
};


exports.getFavouriteList = async (req, res, next) => {
  const userId = req.session.user._id;
  const user = await User.findById(userId).populate("favourites");
  res.render("store/favourite-list", {
    favouriteHomes: user.favourites,
    pageTitle: "My Favourites",
    currentPage: "favourites",
    isLoggedIn: req.session.isLoggedIn || false,
    user: req.session.user || null,
  });
};

exports.postAddToFavourite = async (req, res, next) => {
  const homeId = req.body.id;
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  if (!user.favourites.includes(homeId)) {
    user.favourites.push(homeId);
    await user.save();
  }
  res.redirect("/favourites");
};

exports.postRemoveFromFavourite = async (req, res, next) => {
  const homeId = req.params.homeId;
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  if (user.favourites.includes(homeId)) {
    user.favourites = user.favourites.filter((fav) => fav != homeId);
    await user.save();
  }
  res.redirect("/favourites");
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
