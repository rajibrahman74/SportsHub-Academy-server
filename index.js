const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
var jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// midleware
app.use(cors());
app.use(express.json());

// verified jwt token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized Access!" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized access!" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tcsk2jo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const allDataCollection = client.db("sportsDB").collection("all-data");
    const usersCollection = client.db("sportsDB").collection("users");
    const seletcetedClassCollection = client
      .db("sportsDB")
      .collection("seletcetedClass");
    const paymentsCollection = client.db("sportsDB").collection("payment");

    // jwt token process
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      next();
    };

    app.get("/alldata", async (req, res) => {
      const data = await allDataCollection.find().toArray();
      res.send(data);
    });

    // users collection
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // make admin porcess
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // make instructor process
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // add classes process for instructor add the new classes
    app.post("/addclasses", async (req, res) => {
      const item = req.body;
      const result = await allDataCollection.insertOne(item);
      res.send(result);
    });

    // get selected class data
    app.get("/selectedclass", async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const result = await seletcetedClassCollection.find(query).toArray();
      res.send(result);
    });

    // selected class post process
    app.post("/selectedclass", async (req, res) => {
      const selectedClass = req.body;
      const result = await seletcetedClassCollection.insertOne(selectedClass);
      res.send(result);
    });

    // impliment selected class in delete operation
    app.delete("/selectedclass/:id", async (req, res) => {
      const id = req.params.id;
      const result = await seletcetedClassCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // admin approved patch opeeration
    app.patch("/alldata/:status", async (req, res) => {
      const status = req.params.status;
      console.log(status);
      const filter = { class_status: status };
      const updateDoc = {
        $set: {
          class_status: "approved",
        },
      };
      const result = await allDataCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // class denied patch operation
    app.patch("/deny/:status", async (req, res) => {
      const status = req.params.status;
      console.log(status);
      const filter = { class_status: status };
      const updateDoc = {
        $set: {
          class_status: "denied",
        },
      };
      const result = await allDataCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // class feedback patch operation
    app.patch("/insertFeedback/:id", async (req, res) => {
      const id = req.params.id;
      const feedback = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };

      const result = await allDataCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // payment integaration
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price * amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post("/paymenthistory", verifyJWT, async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      res.send(result);
    });

    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("SportsHub-Academy-server is running");
});

app.listen(port, () => {
  console.log(`SportsHub Acadamy app listening on port ${port}`);
});
