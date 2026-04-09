const Booking = require("../models/booking");
const Home = require("../models/home");

// ✅ POST BOOKING
exports.postBooking = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const { homeId, checkIn, checkOut, guests } = req.body;

    const task = await Home.findById(homeId);

    if (!task) {
      return res.redirect("/tasks");
    }

    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    if (startDate >= endDate) {
      return res.redirect(`/homes/${homeId}`);
    }

    const days = (endDate - startDate) / (1000 * 60 * 60 * 24);

    if (days <= 0) {
      return res.redirect(`/homes/${homeId}`);
    }

    const reward = days * task.price;

    const booking = new Booking({
      home: homeId,
      user: req.session.user._id,
      checkInDate: startDate,
      checkOutDate: endDate,
      guests,
      totalPrice: reward,
      status: "Applied",
    });

    await booking.save();

    res.redirect("/bookings");
  } catch (err) {
    console.log("Task Apply Error:", err);
    res.redirect("/");
  }
};

// ✅ DELETE BOOKING (SEPARATE FUNCTION)
exports.deleteBooking = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect("/login");

    const booking = await Booking.findById(req.params.id);

    if (
      !booking ||
      booking.user.toString() !== req.session.user._id.toString()
    ) {
      return res.redirect("/bookings");
    }

    await Booking.findByIdAndDelete(req.params.id);

    res.redirect("/bookings");
  } catch (err) {
    console.log(err);
    res.redirect("/bookings");
  }
};
