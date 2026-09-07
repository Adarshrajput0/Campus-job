const express = require("express");
const adminRouter = express.Router();
const adminController = require("../controllers/adminController");
const { isAuthenticated, requireRole } = require("../middleware/authMiddleware");

// Enforce authentication & Admin role for all routes under /admin
const isAdmin = [isAuthenticated, requireRole("admin")];

adminRouter.get("/admin/dashboard", isAdmin, adminController.getDashboard);

// Moderation Actions
adminRouter.post("/admin/students/:id/approve", isAdmin, adminController.postApproveStudent);
adminRouter.post("/admin/students/:id/reject", isAdmin, adminController.postRejectStudent);

adminRouter.post("/admin/hosts/:id/approve", isAdmin, adminController.postApproveHost);
adminRouter.post("/admin/hosts/:id/reject", isAdmin, adminController.postRejectHost);

adminRouter.post("/admin/jobs/:id/approve", isAdmin, adminController.postApproveJob);
adminRouter.post("/admin/jobs/:id/reject", isAdmin, adminController.postRejectJob);

// Analytics & Reports
adminRouter.get("/admin/reports", isAdmin, adminController.getReports);
adminRouter.get("/admin/export-csv", isAdmin, adminController.exportCSV);

module.exports = adminRouter;
