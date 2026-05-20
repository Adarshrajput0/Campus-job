const express = require("express");
const hostRouter = express.Router();
const hostController = require("../controllers/hostController");
const upload = require("../utils/multer");

hostRouter.get("/add-home", hostController.getAddHome);

hostRouter.post(
  "/add-home",
  upload.single("photo"),
  hostController.postAddHome,
);

hostRouter.get("/host-home-list", hostController.getHostHomes);

hostRouter.get("/edithome/:homeId", hostController.getEditHome);

hostRouter.post(
  "/edithome",
  upload.single("photo"),
  hostController.postEditHome,
);

hostRouter.post("/delete-home/:homeId", hostController.postDeleteHome);

hostRouter.post("/complete-home/:homeId", hostController.postCompleteHome);
hostRouter.post("/bookings/select/:bookingId", hostController.postSelectBooking);

module.exports = hostRouter;
