const express = require("express");
const hostRouter = express.Router();
const hostController = require("../controllers/hostController");
const upload = require("../utils/multer");

// 🔒 Host-only guard — applied to every route in this router
const isHost = (req, res, next) => {
  if (!req.session.isLoggedIn) {
    return res.redirect("/login");
  }
  if (!req.session.user || req.session.user.userType !== "host") {
    // Logged in but not a host → send back to index
    return res.redirect("/");
  }
  next();
};

hostRouter.get("/add-home", isHost, hostController.getAddHome);

hostRouter.post(
  "/add-home",
  isHost,
  upload.array("files", 10),
  hostController.postAddHome,
);

hostRouter.get("/home-added", isHost, hostController.getHomeAdded);

hostRouter.get("/host-home-list", isHost, hostController.getHostHomes);

hostRouter.get("/edithome/:homeId", isHost, hostController.getEditHome);

hostRouter.post(
  "/edithome",
  isHost,
  upload.array("files", 10),
  hostController.postEditHome,
);

hostRouter.post("/delete-home/:homeId", isHost, hostController.postDeleteHome);

hostRouter.post("/complete-home/:homeId", isHost, hostController.postCompleteHome);

hostRouter.post("/bookings/select/:bookingId", isHost, hostController.postSelectBooking);

module.exports = hostRouter;
