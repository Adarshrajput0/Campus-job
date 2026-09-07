const Notification = require("../models/notification");

/**
 * Creates a notification in DB and emits via Socket.IO to recipient's socket room.
 */
exports.createNotification = async ({
  app,
  userId,
  title,
  message,
  type = "system",
  relatedJob = null,
  relatedApplication = null,
}) => {
  try {
    if (!userId || !title || !message) return null;

    const notification = new Notification({
      user: userId,
      title,
      message,
      type,
      relatedJob,
      relatedApplication,
    });

    await notification.save();

    // Emit live alert via Socket.IO if available
    if (app && app.get("io")) {
      const io = app.get("io");
      io.to(`user_${userId.toString()}`).emit("new_notification", {
        _id: notification._id,
        title,
        message,
        type,
        createdAt: notification.createdAt,
      });
    }

    return notification;
  } catch (err) {
    console.error("[createNotification Error]", err);
    return null;
  }
};
