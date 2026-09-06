const express = require("express");
const hostRouter = express.Router();
const hostController = require("../controllers/hostController");
const upload = require("../utils/multer");

// 🔒 Host-only guard — applied to every route in this router
const { requireRole, requireVerifiedHost } = require("../middleware/authMiddleware");

const isHost = requireRole("host");

hostRouter.get("/add-home", isHost, requireVerifiedHost, hostController.getAddHome);

hostRouter.post(
  "/add-home",
  isHost,
  requireVerifiedHost,
  upload.array("files", 10),
  hostController.postAddHome,
);

hostRouter.get("/home-added", isHost, hostController.getHomeAdded);

hostRouter.get("/host-home-list", isHost, hostController.getHostHomes);

hostRouter.get("/edithome/:homeId", isHost, requireVerifiedHost, hostController.getEditHome);

hostRouter.post(
  "/edithome",
  isHost,
  requireVerifiedHost,
  upload.array("files", 10),
  hostController.postEditHome,
);

hostRouter.post("/delete-home/:homeId", isHost, requireVerifiedHost, hostController.postDeleteHome);

hostRouter.post("/complete-home/:homeId", isHost, requireVerifiedHost, hostController.postCompleteHome);

hostRouter.post("/bookings/select/:bookingId", isHost, requireVerifiedHost, hostController.postSelectBooking);

// Host Applicant Management Routes
hostRouter.post("/applications/:id/shortlist", isHost, requireVerifiedHost, hostController.postShortlistApplicant);
hostRouter.post("/applications/:id/interview", isHost, requireVerifiedHost, hostController.postScheduleInterview);
hostRouter.post("/applications/:id/reject", isHost, requireVerifiedHost, hostController.postRejectApplicant);

module.exports = hostRouter;
