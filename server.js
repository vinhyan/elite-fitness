const express = require('express');
const app = express();
const path = require('path');
const HTTP_PORT = process.env.PORT || 8080;

//****************************
//*        MIDDLEWARE        *
//****************************

//******* Assets *******
app.use(express.static(path.join(__dirname, 'assets')));

//******* Handlebars *******
const exphbs = require('express-handlebars');
app.engine(
  '.hbs',
  exphbs.engine({
    extname: '.hbs',
    helpers: {
      json: (context) => {
        return JSON.stringify(context);
      },
    },
  })
);
app.set('view engine', '.hbs');
app.use(express.urlencoded({ extend: true }));

//******* Session *******
const session = require('express-session');

app.use(
  session({
    secret: 'random string',
    resave: false,
    saveUninitialized: true,
  })
);

//******* Bcrypt *******
const bcrypt = require('bcryptjs');

//******* DotEnv *******
const dotenv = require('dotenv');
dotenv.config({ path: './config/keys.env' });

//**************************
//*        DATABASE        *
//**************************

const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_CONN_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Schema = mongoose.Schema;

//******* Schema & Model *******

// 1. Users collection:
//    a. Every user has a username and password.
const userSchema = new Schema({
  username: String,
  password: String,
  subscription: Boolean,
});

const User = mongoose.model('users_collections', userSchema);

// 2. Classes collection: Stores the classes offered by the gym
//    a. Every class has an image name, class name, length.
const classSchema = new Schema({
  classId: String,
  image: String,
  name: String,
  length: Number,
  price: Number,
});

const Class = mongoose.model('classes_collections', classSchema);

// 3. Payments collection: The payments made by the website’s customers.
//    a. Every payment has a username and total amount paid.
const paymentSchema = new Schema({
  username: String,
  total: Number,
});

const Payment = mongoose.model('payments_collections', paymentSchema);

// 4. Cart collection: Stores the items in the currently logged in user’s cart
//    a. Every document must have the username and id of the corresponding class
const cartSchema = new Schema({
  username: String,
  classId: String,
  amount: Number,
});

const Cart = mongoose.model('carts_collections', cartSchema);

//***************************
//*        ENDPOINTS        *
//***************************

//******** LOGIN PAGE ********
app.get('/', (req, res) => {
  const isLoggedIn = req.session.hasLoggedIn;
  const username = req.session.username;

  return res.render('login', {
    layout: 'primary',
    // signUp: false,
    accountCreated: false,
    isLoggedIn: isLoggedIn,
    username: username,
  });
});

app.post('/login', async (req, res) => {
  const usernameFromForm = req.body.username;
  const passwordFromForm = req.body.password;
  console.log(`[DEBUG]: "/LOGIN" username from form is ${usernameFromForm}`);
  console.log(`[DEBUG]: "/LOGIN" password from form is ${passwordFromForm}`);

  try {
    //**** USER ****
    const userFromDB = await User.findOne({ username: usernameFromForm });

    if (userFromDB === null) {
      return res.render('login', {
        layout: 'primary',
        err: true,
        errMsg: 'Invalid username or password! Please try again!',
      });
    }
    console.log(`[DEBUG]: "/LOGIN" user from DB is ${userFromDB}`);

    const isPasswordSame = await bcrypt.compare(
      passwordFromForm,
      userFromDB.password
    );

    if (isPasswordSame) {
      req.session.hasLoggedIn = true;
      req.session.username = usernameFromForm;
      req.session.subscription = userFromDB.subscription;
      console.log(
        `[DEBUG]: "/LOGIN" user “${req.session.username}” has logged in. Subsription: ${req.session.subscription}`
      );

      console.log(`[DEBUG] "/LOGIN" current session:`);
      console.log(req.session);

      //**** CLASSES ****

      const classesFromDB = await Class.find().lean();

      if (classesFromDB.length === 0) {
        return res.render('classes', {
          layout: 'primary',
          err: true,
          errMsg: 'We currently do not have any classes...',
        });
      }

      //**** CART ITEMS ****

      let classesToDisplay = [];
      const cartItemsFromDB = await Cart.find({
        username: req.session.username,
      }).lean();

      //If User has all classes in their cart
      if (cartItemsFromDB.length === classesFromDB.length) {
        return res.render('classes', {
          layout: 'primary',
          classes: classesToDisplay,
          isLoggedIn: req.session.hasLoggedIn,
          err: true,
          errMsg: 'There are no more classes available',
        });
      }

      //If user currently has some classes in their cart
      if (cartItemsFromDB.length > 0) {
        for (let i = 0; i < classesFromDB.length; i++) {
          let matching = false;
          for (let j = 0; j < cartItemsFromDB.length && !matching; j++) {
            if (classesFromDB[i].classId === cartItemsFromDB[j].classId) {
              matching = true;
            }
          }
          if (!matching) classesToDisplay.push(classesFromDB[i]);
        }
      } else {
        classesToDisplay = classesFromDB;
      }

      return res.render('classes', {
        layout: 'primary',
        classes: classesToDisplay,
        isLoggedIn: req.session.hasLoggedIn,
      });
    } else {
      return res.render('login', {
        layout: 'primary',
        err: true,
        errMsg: 'Invalid password! Please try again!',
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.post('/signup/:username', async (req, res) => {
  const usernameFromParam = req.params.username;
  const subscriptFromForm = req.body.subscription;
  console.log(`[DEBUG]: "/SIGNUP" username from form: ${usernameFromParam}`);
  console.log(
    `[DEBUG]: "/SIGNUP" subscription from form: ${subscriptFromForm}`
  );
  try {
    //**** USER ****
    const userFromDB = await User.findOne({ username: usernameFromParam });

    if (userFromDB === null) {
      return res.render('login', {
        layout: 'primary',
        err: true,
        errMsg: 'Something went wrong! Username not found!',
      });
    }

    if (subscriptFromForm === 'monthly') {
      //**** PAYMENT ****
      const paymentToAdd = Payment({
        username: userFromDB.username,
        total: 75,
      });
      await paymentToAdd.save();

      userFromDB.subscription = true;
      await userFromDB.save();
    }

    req.session.hasLoggedIn = true;
    req.session.username = userFromDB.username;
    req.session.subscription = userFromDB.subscription;

    //**** CLASSES ****
    const classesFromDB = await Class.find().lean();

    if (classesFromDB.length === 0) {
      return res.render('classes', {
        layout: 'primary',
        err: true,
        errMsg: 'We currently do not have any classes...',
      });
    }

    return res.render('classes', {
      layout: 'primary',
      classes: classesFromDB,
      isLoggedIn: req.session.hasLoggedIn,
    });
  } catch (err) {
    console.log(err);
  }
  console.log(`[DEBUG]: username from params: ${usernameFromParam}`);
  res.render('login', { layout: 'primary', signUp: true });
});

app.post('/create-account', async (req, res) => {
  const usernameFromForm = req.body.username;
  const passwordFromForm = req.body.password;
  console.log(
    `[DEBUG]: "/CREATE-ACCOUNT" username from form is ${usernameFromForm}`
  );

  if (usernameFromForm === '' || passwordFromForm === '') {
    return res.render('login', {
      layout: 'primary',
      err: true,
      errMsg: 'Username and password can not be empty!',
      accountCreated: false,
    });
  }

  try {
    const usersFromDB = await User.findOne({ username: usernameFromForm });

    //check if username does not exist in the database
    if (usersFromDB === null) {
      //hash password before adding account to the database
      const hashedPassword = await bcrypt.hash(passwordFromForm, 10);

      //add user to the database
      const userToAdd = new User({
        username: usernameFromForm,
        password: hashedPassword,
        subscription: false,
      });

      await userToAdd.save();

      return res.render('login', {
        layout: 'primary',
        accountCreated: true,
        username: usernameFromForm,
      });
    } else {
      return res.render('login', {
        layout: 'primary',
        err: true,
        errMsg: 'Username already exists!',
        accountCreated: false,
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  return res.render('login', {
    layout: 'primary',
    signUp: false,
    accountCreated: false,
    isLoggedIn: false,
  });
});

//******** CLASSES PAGE ********

app.get('/classes', async (req, res) => {
  let classesToDisplay = [];

  try {
    //**** CLASSES *****
    const classesFromDB = await Class.find().lean();

    if (classesFromDB.length === 0) {
      return res.render('classes', {
        layout: 'primary',
        err: true,
        errMsg: 'We currently do not have any classes...',
        isLoggedIn: req.session.hasLoggedIn,
      });
    }

    //If user is logged in, check cart items and display classes accordingly
    if (req.session.hasLoggedIn) {
      const username = req.session.username;

      //**** CART *****
      const cartItemsFromDB = await Cart.find({ username: username }).lean();

      //If User has all classes in their cart
      if (cartItemsFromDB.length === classesFromDB.length) {
        return res.render('classes', {
          layout: 'primary',
          classes: classesToDisplay,
          isLoggedIn: req.session.hasLoggedIn,
          err: true,
          errMsg: 'There are no more classes available',
        });
      }

      //If user currently has items in their cart
      if (cartItemsFromDB.length > 0) {
        for (let i = 0; i < classesFromDB.length; i++) {
          let matching = false;
          for (let j = 0; j < cartItemsFromDB.length && !matching; j++) {
            if (classesFromDB[i].classId === cartItemsFromDB[j].classId) {
              matching = true;
            }
          }
          if (!matching) classesToDisplay.push(classesFromDB[i]);
        }
      } else {
        classesToDisplay = classesFromDB;
      }
    } else {
      classesToDisplay = classesFromDB;
    }

    return res.render('classes', {
      layout: 'primary',
      classes: classesToDisplay,
      isLoggedIn: req.session.hasLoggedIn,
    });
  } catch (err) {
    console.log(err);
  }
});

app.post('/add-class/:classId', async (req, res) => {
  const idFromParam = req.params.classId;

  console.log(`[DEBUG] "/add-class" class Id from param ${idFromParam}`);

  let classesToDisplay = [];

  try {
    //**** CLASSES ****
    const classesFromDB = await Class.find().lean();
    const selectedClassFromDB = await Class.findOne({
      classId: idFromParam,
    }).lean();

    if (classesFromDB.length === 0) {
      return res.render('classes', {
        layout: 'primary',
        classes: classesFromDB,
        err: true,
        errMsg: 'Something went wrong! No classes found!',
        isLoggedIn: req.session.hasLoggedIn,
      });
    }

    //If not logged in
    if (!req.session.hasLoggedIn) {
      return res.render('classes', {
        layout: 'primary',
        classes: classesFromDB,
        err: true,
        errMsg: 'You must log in to book a class',
        isLoggedIn: req.session.hasLoggedIn,
      });
    }

    const usernameFromSession = req.session.username;
    console.log(
      `[DEBUG] "/add-class" username from session ${usernameFromSession}`
    );

    //**** USER *****
    const userFromDB = await User.findOne({ username: req.session.username });

    if (userFromDB === null) {
      return res.render('classes', {
        layout: 'primary',
        classes: classesToDisplay,
        err: true,
        errMsg: 'Something went wrong! User not found',
        isLoggedIn: req.session.hasLoggedIn,
      });
    }

    //**** SINGLE CART ITEM ****
    const cartItemToAdd = Cart({
      username: usernameFromSession,
      classId: idFromParam,
      amount: selectedClassFromDB.price,
    });
    await cartItemToAdd.save();

    //**** WHOLE CART ****
    const cartItemsFromDB = await Cart.find({
      username: usernameFromSession,
    }).lean();
    console.log(cartItemsFromDB);

    if (cartItemsFromDB.length === classesFromDB.length) {
      return res.render('classes', {
        layout: 'primary',
        classes: classesToDisplay,
        isLoggedIn: req.session.hasLoggedIn,
        err: true,
        errMsg: 'There are no more classes available',
      });
    } else {
      for (let i = 0; i < classesFromDB.length; i++) {
        let matching = false;
        for (let j = 0; j < cartItemsFromDB.length && !matching; j++) {
          if (classesFromDB[i].classId === cartItemsFromDB[j].classId) {
            matching = true;
          }
        }
        if (!matching) classesToDisplay.push(classesFromDB[i]);
      }
    }

    return res.render('classes', {
      layout: 'primary',
      classes: classesToDisplay,
      isLoggedIn: req.session.hasLoggedIn,
    });
  } catch (err) {
    console.log(err);
  }
});

//******** CART PAGE ********

app.get('/cart', async (req, res) => {
  try {
    // If not logged in
    if (!req.session.hasLoggedIn) {
      return res.render('cart', {
        layout: 'primary',
        isLoggedIn: false,
        err: true,
        errMsg: 'You need to log in to view your cart',
        isLoggedIn: req.session.hasLoggedIn,
      });
    }

    //**** USER FROM SESSION ****
    const username = req.session.username;

    //**** CART *****
    const cartItemsFromDB = await Cart.find({ username: username }).lean();

    if (cartItemsFromDB.length === 0) {
      return res.render('cart', {
        layout: 'primary',
        err: true,
        errMsg: 'Sorry, you do not have any items in your cart',
        isLoggedIn: req.session.hasLoggedIn,
      });
    }

    //calculate SUBTOTAL & TAX & TOTAL
    let subtotal = 0; //monthly plan
    if (!req.session.subscription) {
      // regular plan
      for (let i = 0; i < cartItemsFromDB.length; i++) {
        subtotal += cartItemsFromDB[i].amount;
      }
    }
    let taxAmt = subtotal * 0.13;
    let total = subtotal + taxAmt;

    //**** CLASSES *****
    const classesFromDB = await Class.find().lean();

    if (classesFromDB.length === 0) {
      return res.render('cart', {
        layout: 'primary',
        err: true,
        errMsg: 'Something went wrong! No items found',
        isLoggedIn: req.session.hasLoggedIn,
      });
    }

    const itemsToDisplay = [];
    //class items
    for (let i = 0; i < cartItemsFromDB.length; i++) {
      for (let j = 0; j < classesFromDB.length; j++) {
        if (cartItemsFromDB[i].classId === classesFromDB[j].classId) {
          itemsToDisplay.push({
            id: classesFromDB[j].classId,
            name: classesFromDB[j].name,
            length: classesFromDB[j].length,
            amount: cartItemsFromDB[i].amount,
          });
        }
      }
    }

    return res.render('cart', {
      layout: 'primary',
      items: itemsToDisplay,
      isLoggedIn: req.session.hasLoggedIn,
      isMonthlyPlan: req.session.subscription,
      subtotal: subtotal,
      taxAmt: taxAmt,
      total: total,
      username: req.session.username,
    });
  } catch (err) {
    console.log(err);
  }
});

app.post('/remove-item/:id', async (req, res) => {
  const itemIdFromParam = req.params.id;
  console.log(`[DEBUG] "/remove-item" item id from param: ${itemIdFromParam}`);

  try {
    //**** SINGLE CART ITEM ****
    const cartItemFromDB = await Cart.findOne({ classId: itemIdFromParam });

    if (cartItemFromDB === null) {
      return res.render('cart', {
        layout: 'primary',
        err: true,
        errMsg: 'Something went wrong! Could not find the item from cart',
        isLoggedIn: req.session.hasLoggedIn,
      });
    }

    const delItemResult = await Cart.deleteOne({
      classId: cartItemFromDB.classId,
    });

    if (delItemResult.deletedCount > 0) {
      const username = req.session.username;

      //**** WHOLE CART *****
      const cartItemsFromDB = await Cart.find({ username: username }).lean();

      if (cartItemsFromDB.length === 0) {
        return res.render('cart', {
          layout: 'primary',
          err: true,
          errMsg: 'Sorry, you do not have any items in your cart',
          isLoggedIn: req.session.hasLoggedIn,
        });
      }

      //calculate SUBTOTAL & TAX & TOTAL
      let subtotal = 0; //monthly plan
      if (!req.session.subscription) {
        // regular plan
        for (let i = 0; i < cartItemsFromDB.length; i++) {
          subtotal += cartItemsFromDB[i].amount;
        }
      }
      let taxAmt = subtotal * 0.13;
      let total = subtotal + taxAmt;

      //**** CLASSES *****
      const classesFromDB = await Class.find().lean();

      if (classesFromDB.length === 0) {
        return res.render('cart', {
          layout: 'primary',
          err: true,
          errMsg: 'Something went wrong! No items found',
          isLoggedIn: req.session.hasLoggedIn,
        });
      }

      const itemsToDisplay = [];
      for (let i = 0; i < cartItemsFromDB.length; i++) {
        for (let j = 0; j < classesFromDB.length; j++) {
          if (cartItemsFromDB[i].classId === classesFromDB[j].classId) {
            itemsToDisplay.push({
              id: classesFromDB[j].classId,
              name: classesFromDB[j].name,
              length: classesFromDB[j].length,
              amount: cartItemsFromDB[i].amount,
            });
          }
        }
      }

      return res.render('cart', {
        layout: 'primary',
        items: itemsToDisplay,
        isLoggedIn: req.session.hasLoggedIn,
        isMonthlyPlan: req.session.subscription,
        subtotal: subtotal,
        taxAmt: taxAmt,
        total: total,
        username: req.session.username,
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.post('/pay/:username/:total', async (req, res) => {
  try {
    const usernameFromParam = req.params.username;
    const toalFromParam = req.params.total;
    console.log(`[DEBUG] "/payments" username is ${usernameFromParam}`);
    console.log(`[DEBUG] "/payments" total is ${toalFromParam}`);

    //**** PAYMENT ****
    const paymentToAdd = Payment({
      username: usernameFromParam,
      total: toalFromParam,
    });

    await paymentToAdd.save();

    // const cartItemsFromDB = await Cart.find({ username: usernameFromParam });
    // if (cartItemsFromDB.length === 0) {
    //   return res.send('ERROR! Something went wrong, your cart is empty');
    // }
    // let delCnt = 0;
    // for (let i = 0; i < cartItemsFromDB.length; i++) {
    //   const resObj = await Cart.deleteOne({
    //     classId: cartItemsFromDB[i].classId,
    //   });
    //   if (resObj.deletedCount > 0) delCnt++;
    // }

    const resObj = await Cart.deleteMany({ username: usernameFromParam });
    if (resObj.deletedCount > 0) {
      return res.send('Thank you! You have checked out successfully!');
    }

    return res.send('ERROR! Something went wrong, cannot checkout properly!');

    // if (delCnt < cartItemsFromDB.length) {
    //   return res.send(
    //     'ERROR! Something went wrong, some items cannot be removed'
    //   );
    // }

    // return res.send('Thank you! You have checked out successfully!');
  } catch (err) {
    console.log(err);
  }
});

//******** PAYMENTS ENDPOINT ********

app.get('/payments', async (req, res) => {
  //shows all payments in the database
  try {
    const paymentsFromDB = await Payment.find();

    if (paymentsFromDB.length === 0) {
      return res.send('ERROR! There is no payment from database');
    }

    return res.send(paymentsFromDB);
  } catch (err) {
    console.log(err);
  }
});

const httpOnStart = () => {
  console.log(`Server is starting on port ${HTTP_PORT}`);
  console.log(`Ctrl+C is exit`);
};

app.listen(HTTP_PORT, httpOnStart);

// [{
//   "classId": "CF001",
//   "image": "/images/crossfit.jpg",
//   "name": "Cross Fit with Daniel - Beginner",
//   "length": 60,
//   "price": 25
// },
// {
//   "classId": "KB002",
//   "image": "/images/kickboxing.jpg",
//   "name": "Kickboxing with Joshua - Advanced",
//   "length": 45,
//    "price": 25
// },
// {
//   "classId": "PL003",
//   "image": "/images/pilates.jpg",
//   "name": "Pilates with Helen - All Levels",
//   "length": 60,
//   "price": 25
// },
// {
//   "classId": "YG004",
//   "image": "/images/yoga.jpg",
//   "name": "Hatha Yoga with Kelsey - Intermediate",
//   "length": 60,
//   "price": 25
// }]
