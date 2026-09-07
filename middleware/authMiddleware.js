const User = require("../models/user");

/**
 * Ensures user is authenticated via Express session.
 */
exports.isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.isLoggedIn || !req.session.user) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes("json"))) {
      return res.status(401).json({ error: "Authentication required" });
    }
    return res.redirect("/login");
  }
  next();
};

/**
 * Restricts access to users with specified role(s).
 * Example usage: requireRole("student"), requireRole("host"), requireRole("admin")
 */
exports.requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.isLoggedIn || !req.session.user) {
      return res.redirect("/login");
    }

    const userRole = req.session.user.userType;
    // Map legacy 'guest' to 'student'
    const normalizedRole = userRole === "guest" ? "student" : userRole;

    if (!roles.includes(normalizedRole)) {
      console.warn(`[RBAC Access Denied] User ${req.session.user._id} (${userRole}) attempted to access role-restricted route [${roles.join(",")}]`);
      
      if (req.xhr || (req.headers.accept && req.headers.accept.includes("json"))) {
        return res.status(403).json({ error: "Access denied for your role." });
      }

      // Redirect user to their appropriate role home
      if (userRole === "admin") return res.redirect("/admin/dashboard");
      if (userRole === "host") return res.redirect("/host-home-list");
      return res.redirect("/");
    }

    next();
  };
};

/**
 * Requires student to have completed profile (Auto-approves all students).
 */
exports.requireVerifiedStudent = async (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect("/login");
  }

  try {
    const user = await User.findById(req.session.user._id);
    if (!user) return res.redirect("/login");

    if (user.verificationStatus !== "approved" || !user.isVerified) {
      user.verificationStatus = "approved";
      user.isVerified = true;
      await user.save();
      req.session.user = user.toObject();
    }

    next();
  } catch (err) {
    console.error("[requireVerifiedStudent Error]", err);
    next();
  }
};

/**
 * Requires host to have completed profile (Auto-approves all hosts).
 */
exports.requireVerifiedHost = async (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect("/login");
  }

  try {
    const user = await User.findById(req.session.user._id);
    if (!user) return res.redirect("/login");

    if (user.hostVerificationStatus !== "approved" || !user.isHostVerified) {
      user.hostVerificationStatus = "approved";
      user.isHostVerified = true;
      await user.save();
      req.session.user = user.toObject();
    }

    next();
  } catch (err) {
    console.error("[requireVerifiedHost Error]", err);
    next();
  }
};


/**
 * Validates if student email ends with allowed university domain (if configured).
 */
exports.validateUniversityEmail = (email) => {
  const allowedDomain = process.env.ALLOWED_UNIVERSITY_EMAIL_DOMAIN;
  if (!allowedDomain || allowedDomain.trim() === "" || allowedDomain.trim() === "*" || allowedDomain === "example.edu") {
    return true; // Configurable: permit all if domain check is disabled or set to wildcard
  }

  if (!email || typeof email !== "string") return false;
  const cleanEmail = email.trim().toLowerCase();
  const cleanDomain = allowedDomain.trim().toLowerCase();

  return cleanEmail.endsWith(`@${cleanDomain}`);
};
