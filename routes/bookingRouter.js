const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");

const isAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
};

router.post('/bookings', isAuth, bookingController.postBooking);
router.post('/bookings/cancel/:id', isAuth, bookingController.postCancelBooking);
router.post('/bookings/release/:id', isAuth, bookingController.postReleaseBooking);

router.get("/bookings", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const Booking = require("../models/booking");

  const bookings = await Booking.find({ user: req.session.user._id }).populate(
    "home",
  );

  res.render("store/bookings", {
    pageTitle: "My Applications",
    currentPage: "bookings",
    bookings: bookings,
    isLoggedIn: req.session.isLoggedIn || true,
    user: req.session.user,
  });
});

module.exports = router;
