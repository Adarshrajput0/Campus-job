const express = require("express");
const authRouter = express.Router();
const authController = require("../controllers/authController");

// Clerk-powered auth — redirects to Clerk hosted UI
authRouter.get("/login",  authController.getLogin);
authRouter.get("/signup", authController.getSingup);

// Clerk callback — fires after user authenticates on Clerk's hosted UI
authRouter.get("/sso-callback", authController.clerkCallback);

// Role selection (shown once for new Clerk sign-ups)
authRouter.get("/complete-profile",  authController.getCompleteProfile);
authRouter.post("/complete-profile", authController.postCompleteProfile);

// Logout & guest demo
authRouter.post("/logout",       authController.postLogout);
authRouter.get("/guest-login",   authController.guestLogin);

module.exports = authRouter;
