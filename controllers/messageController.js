const Message = require("../models/message");
const Booking = require("../models/booking");

// ─── GET: View Chat for a specific booking ──────────────────────────────────
exports.getChat = async (req, res, next) => {
  try {
    const bookingId = req.params.bookingId;
    
    // Check if user is logged in
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user._id;

    // Fetch the booking and populate home to check host ownership
    const booking = await Booking.findById(bookingId).populate("home").populate("user");
    
    if (!booking) {
      return res.redirect("/");
    }

    // Verify access: user must be the applicant OR the host of the task
    const isApplicant = booking.user._id.toString() === userId.toString();
    const isHost = booking.home && booking.home.owner && booking.home.owner.toString() === userId.toString();

    if (!isApplicant && !isHost) {
      console.log("Unauthorized chat access attempt by user:", userId);
      return res.redirect("/");
    }

    // Mark messages as read where user is the recipient
    await Message.updateMany({ booking: bookingId, recipient: userId, read: false }, { read: true });

    // Fetch messages for this booking
    const messages = await Message.find({ booking: bookingId }).populate("sender").sort({ createdAt: 1 });

    res.render("chat/index", {
      pageTitle: "Chat - " + (booking.home ? booking.home.houseName : "Task"),
      currentPage: "chat",
      isLoggedIn: req.session.isLoggedIn,
      user: req.session.user,
      messages: messages,
      booking: booking,
      isHost: isHost
    });

  } catch (err) {
    console.error("[getChat Error]", err);
    res.redirect("/");
  }
};

// ─── POST: Send a message ───────────────────────────────────────────────────
exports.postMessage = async (req, res, next) => {
  try {
    const bookingId = req.params.bookingId;
    const { content } = req.body;

    console.log("postMessage called", { bookingId, content, file: req.file });

    // Check if user is logged in
    if (!req.session.user) {
      console.log("No session user");
      return res.redirect("/login");
    }

    const userId = req.session.user._id;

    // Fetch the booking to verify access
    const booking = await Booking.findById(bookingId).populate("home");

    if (!booking) {
      console.log("Booking not found");
      return res.redirect("/");
    }

    // Verify access
    const isApplicant = booking.user.toString() === userId.toString();
    const isHost = booking.home && booking.home.owner && booking.home.owner.toString() === userId.toString();

    if (!isApplicant && !isHost) {
      console.log("Unauthorized post message attempt by user:", userId);
      return res.redirect("/");
    }

    if ((!content || content.trim() === "") && !req.file) {
      console.log("Content and file are both empty");
      return res.redirect(`/chat/${bookingId}`);
    }

    const recipientId = isApplicant ? booking.home.owner : booking.user;

    const messageData = {
      booking: bookingId,
      sender: userId,
      recipient: recipientId,
      content: content ? content.trim() : ""
    };

    if (req.file) {
      messageData.attachment = {
        url: req.file.path,
        name: req.file.originalname,
        type: req.file.mimetype
      };
      console.log("Adding attachment data:", messageData.attachment);
    }

    const newMessage = new Message(messageData);

    await newMessage.save();
    console.log("Message saved successfully");

    await newMessage.populate("sender", "firstName lastName _id");

    const io = req.app.get('io');
    if (io) {
      io.to(bookingId).emit('newMessage', newMessage);
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.status(200).json({ success: true, message: newMessage });
    }

    res.redirect(`/chat/${bookingId}`);

  } catch (err) {
    console.error("[postMessage Error]", err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.status(500).json({ success: false, error: "Server error" });
    }
    const bookingId = req.params.bookingId;
    res.redirect(`/chat/${bookingId || ""}`);
  }
};

// ─── POST: Delete a message ─────────────────────────────────────────────────
exports.deleteMessage = async (req, res, next) => {
  try {
    const messageId = req.params.messageId;

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.redirect("back");
    }

    // Only allow deletion if the logged-in user is the sender
    if (message.sender.toString() !== userId.toString()) {
      console.log("Unauthorized delete message attempt by user:", userId);
      return res.redirect("back");
    }

    await Message.findByIdAndDelete(messageId);

    const io = req.app.get('io');
    if (io) {
      io.to(message.booking.toString()).emit('messageDeleted', messageId);
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.status(200).json({ success: true });
    }

    res.redirect(`/chat/${message.booking}`);

  } catch (err) {
    console.error("[deleteMessage Error]", err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.status(500).json({ success: false, error: "Server error" });
    }
    res.redirect("back");
  }
};
