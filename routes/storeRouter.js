const path = require("path");
const express = require("express");
const storeController = require("../controllers/storeController");
const aiController = require("../controllers/aiController");

const storeRouter = express.Router();

const isAuth = (req, res, next) => {
  if (!req.session.isLoggedIn) {
    return res.redirect("/login");
  }
  next();
};

// Blocks users who are logged in but haven't completed the registration form yet
const requireProfileComplete = (req, res, next) => {
  if (!req.session.isLoggedIn || !req.session.user) {
    return res.redirect("/login");
  }
  const u = req.session.user;
  // guest userType means they authenticated via Clerk but skipped /complete-profile
  if (!u.profileComplete || u.userType === "guest") {
    return res.redirect("/complete-profile");
  }
  next();
};

storeRouter.get("/", requireProfileComplete, storeController.getIndex);
storeRouter.get("/homes", storeController.getHomes);
storeRouter.get("/bookings", storeController.getBookings);
storeRouter.get("/favourites", storeController.getFavouriteList);
storeRouter.get("/homes/:homeId", storeController.getHomeDetails);

storeRouter.post("/favourites", storeController.postAddToFavourite);
storeRouter.post(
  "/favourites/delete/:homeId",
  storeController.postRemoveFromFavourite
);

// Profile and AI Smart Matching Routes
storeRouter.get("/profile", isAuth, aiController.getProfile);
storeRouter.post("/profile", isAuth, aiController.postProfile);
storeRouter.get("/smart-matches", isAuth, aiController.getSmartMatches);

module.exports = storeRouter;


