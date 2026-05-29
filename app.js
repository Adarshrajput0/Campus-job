require("dotenv").config();
const DB_PATH =
  "mongodb+srv://root:root@cluster0.mcc5pm2.mongodb.net/job_db?appName=Cluster0";

const path = require("path");
const express = require("express");
const { clerkMiddleware } = require("@clerk/express");
const storeRouter = require("./routes/storeRouter");
const hostRouter = require("./routes/hostRouter");
const authRouter = require("./routes/authRouter");
const rootDir = require("./utils/pathUtils");
const errorsController = require("./controllers/error");
const { default: mongoose } = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
require("dotenv").config();
const bookingRouter = require("./routes/bookingRouter");
const aiRoutes = require("./routes/aiRoutes");

const app = express();
app.use(express.json());
// Clerk middleware — must be first so req.auth is available everywhere
app.use(clerkMiddleware());
app.get("/chatbot", (req, res) => {
  res.render("chatbot");
});

app.set("view engine", "ejs");
app.set("views", "views");
const store = MongoStore.create({
  mongoUrl: DB_PATH,
  collectionName: "sessions",
});

const randomString = (length) => {
  const characters = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

app.use(express.urlencoded());
app.use(express.static(path.join(rootDir, "public")));

app.use(
  session({
    secret: "Adarsh Singh Rajput",
    resave: false,
    saveUninitialized: false,
    store: store, // USE the store you already created
  }),
);

const Message = require("./models/message");

app.use(async (req, res, next) => {
  res.locals.isLoggedIn = req.session.isLoggedIn || false;
  res.locals.user = req.session.user || null;

  if (req.session.isLoggedIn && req.session.user) {
    try {
      res.locals.unreadCount = await Message.countDocuments({
        recipient: req.session.user._id,
        read: false
      });
    } catch (err) {
      console.error("Error fetching unread count:", err);
      res.locals.unreadCount = 0;
    }
  } else {
    res.locals.unreadCount = 0;
  }

  next();
});

app.use("/ai", aiRoutes);

app.use(storeRouter);
app.use(authRouter);
app.use(bookingRouter);
const messageRouter = require("./routes/messageRouter");
app.use(messageRouter);
// Host-only middleware — checks session, not req.user
app.use("/host", (req, res, next) => {
  if (req.session.isLoggedIn && req.session.user && req.session.user.userType === "host") {
    next();
  } else if (!req.session.isLoggedIn) {
    res.redirect("/login");
  } else {
    // Logged in but not a host
    res.redirect("/");
  }
});
app.use(hostRouter);
// app.get("/chatbot", (req, res) => {
//   res.render("chatbot");
// });

app.use(errorsController.pageNotFound);

const PORT = 3010;

mongoose
  .connect(DB_PATH)
  .then(() => {
    console.log("Connected to Mongo");
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Error While Connecting to Mongo:", err);
  });
