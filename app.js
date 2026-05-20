require("dotenv").config();
const DB_PATH =
  "mongodb+srv://root:root@cluster0.mcc5pm2.mongodb.net/job_db?appName=Cluster0";

const path = require("path");
const express = require("express");
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

app.use((req, res, next) => {
  res.locals.isLoggedIn = req.session.isLoggedIn || false;
  res.locals.user = req.session.user || null;

  next();
});

app.use("/ai", aiRoutes);

app.use(storeRouter);
app.use(authRouter);
app.use(bookingRouter);
app.use("/host", (req, res, next) => {
  if (req.user && req.user.userType === "host") {
    next();
  } else {
    res.redirect("/login");
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
