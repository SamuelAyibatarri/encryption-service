from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, Integer, String, Column, Float
from sqlalchemy.orm import declarative_base, sessionmaker
import bcrypt
import time

app = Flask(__name__)
CORS(app)

# Database setup
engine = create_engine("sqlite:///dataBase.db", echo=True)
Base = declarative_base()
Session = sessionmaker(bind=engine)
session = Session()

# User model
class userModel(Base):
    __tablename__ = "userModel"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String)
    publicKey = Column(String)
    privateKey = Column(String)
    password = Column(String)  # This is the bcrypt hashed password

    def todict(self):
        return {
            "id": self.id,
            "publicKey": self.publicKey,
            "privateKey": self.privateKey,
            "username": self.username
        }

# Data model
class dataModel(Base):
    __tablename__ = "dataModel"

    id = Column(Integer, primary_key=True, autoincrement=True)
    encrypted = Column(String(12000000000000000))
    name = Column(String)
    note = Column(String)
    sizeInKB = Column(Float)
    sizeInMB = Column(Float)
    date = Column(Integer)
    iv = Column(String)  # Changed from Integer — IVs are usually strings or bytes
    recipient = Column(String)
    tag = Column(String)
    encryptedAESKey = Column(String(10000))

    def todict(self):
        return {
            "id": self.id,
            "name": self.name,
            "sizeInKB": self.sizeInKB,
            "sizeInMB": self.sizeInMB,
            "encryptedAESKey": self.encryptedAESKey,
            "iv": self.iv,
            "recipient": self.recipient,
            "tag": self.tag,
            "note": self.note,
            "date": self.date,
            "encrypted": self.encrypted,
        }


# Create all tables
Base.metadata.create_all(engine)

# Signup route
@app.route('/signup', methods=['POST'])
def signup():
    sentdata = request.get_json()
    if not sentdata or 'user' not in sentdata:
        return jsonify({"error": "Invalid request format"}), 400

    user_data = sentdata["user"]

    username = user_data.get("username")
    publicKey = user_data.get("publicKey")
    privateKey = user_data.get("privateKey", "")
    hashed_password = user_data.get("bcryptEncryptedPassword")

    if not username or not publicKey or not hashed_password:
        return jsonify({"error": "Missing fields"}), 400

    newUser = userModel(
        username=username,
        publicKey=publicKey,
        privateKey=privateKey,
        password=hashed_password  # Store already-hashed password
    )

    session.add(newUser)
    session.commit()

    return jsonify({"message": "User created successfully"}), 201


# Login route
@app.route("/login", methods=["POST"])
def login():
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request format"}), 400

    sentdata = request.get_json()
    username = sentdata.get("username")
    password = sentdata.get("password")

    if not username or not password:
        return jsonify({"success": False, "message": "Missing fields"}), 400

    user = session.query(userModel).filter_by(username=username).first()

    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    # Compare hashed password
    if bcrypt.checkpw(password.encode(), user.password.encode()):
        return jsonify({
            "success": True,
            "message": "Login successful",
            "user": user.todict()
        }), 200
    else:
        return jsonify({"success": False, "message": "Incorrect password"}), 401

# Receive encrypted data
@app.route("/submit", methods=["POST"])
def recieve_data():
    if not request.is_json:
        return {
            "success": False,
            "message": "Data must be sent in JSON format, not form",
            "status": 500
        }

    sentdata = request.get_json()
    file_data = sentdata["files"][0]

    new_data = dataModel(
    encrypted=file_data["encrypted"],
    name=file_data["name"],
    note=sentdata["notes"],
    sizeInKB=float(file_data["sizeInKB"]),
    sizeInMB=float(file_data["sizeInMB"]),
    iv=file_data["iv"],
    recipient=file_data["recipient"],
    tag=sentdata["tag"],
    encryptedAESKey=sentdata["encryptedAESKey"]
)

    session.add(new_data)
    session.commit()

    return {
        "success": True,
        "data": sentdata,
        "status": 200
    }

#Delete uploaded/recieved file
@app.route("/delete", methods=["post"])
def deleteFile():
    if not request.is_json:
        return {
            "success": False,
            "message": "Data must be sent in JSON format",
            "status": 500
        }
    
    data = request.get_json()
    file_id = data.get('id')
    file_name = data.get('name')
    current_user = data.get('current_user')

    if not file_name or not file_id:
        return jsonify({"error": "File id and file name is required"}), 400
    
    if not current_user:
        return jsonify({"error": "Current user is required"}), 400

    try:
        username = session.query(userModel).filter_by(username=current_user).first()
        if not username:
            return jsonify({"success": False, "message": "No such user exists"}), 404

        file_entry = session.query(dataModel).filter_by(id=file_id, name=file_name, recipient=current_user).first()
        if not file_entry:
            return jsonify({"success": False, "message": "No such file exists"}), 404


        # Delete entry
        session.delete(file_entry)
        session.commit()

        return jsonify({"success": True, "message": f"File '{file_name}' deleted successfully"}), 200

    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": f"Error: {str(e)}"}), 500


# Get all uploads for a user
@app.route("/<string:username>")
def home(username):
    data = session.query(dataModel).filter_by(recipient=username).all()

    return jsonify([
        {
            "id": m.id,
            "name": m.name,
            "note": m.note,
            "sizeInKB": m.sizeInKB,
            "sizeInMB": m.sizeInMB,
            "tag": m.tag
        } for m in data
    ])


# Get a specific encrypted upload by ID
@app.route("/<string:recipient>/<int:id>")
def select(recipient, id):
    data = session.query(dataModel).filter_by(id=id, recipient=recipient).first()

    if data:
        return jsonify(data.todict())
    else:
        return jsonify({"error": "Data not found"}), 404
    
# Get a public key of user
@app.route("/publickey/<string:recipient>")
def getPub(recipient):
    data = session.query(userModel).filter_by(username=recipient).first()

    if data:
        return jsonify({"publicKey": data.publicKey})
    else:
        return jsonify({"error": "Data not found"}), 404



# Run app
if __name__ == "__main__":
    app.run(debug=True)
