/**
 * This skill acts as a calculator for determining metabolic rate
 */

// this is used for leveraging different components of AWS
var aws = require('aws-sdk');

// this is unique for the Alexa skill
var APP_ID = 'amzn1.ask.skill.6558c8a3-bbf2-4fd3-a335-21ace2be3d42';

// this is used by the VoiceLabs analytics
const VLKey = '9e510250-90bc-11a7-0c61-0eb19d13e26e';
var VoiceLabs = require("voicelabs")(VLKey);

// this is where the images used in the visual portion of the skill
const bucketLoc = "https://s3.amazonaws.com/metablogiccalculator/"; 

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        console.log("event.session.application.applicationId=" + event.session.application.applicationId);

        /**
         * This validates that the applicationId matches what is provided by Amazon.
         */
        if (event.session.application.applicationId !== APP_ID) {
             context.fail("Invalid Application ID");
        }

        console.log(JSON.stringify(event));

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(event.request,
                event.session,
                event.context,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "IntentRequest") {
            onIntent(event.request,
                event.session,
                event.context,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "SessionEndedRequest") {
            console.log("session ended request received");
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        context.fail("Exception: " + e);
    }
};

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId +
        ", sessionId=" + session.sessionId);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, context, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId + ", sessionId=" + session.sessionId);

    // need to determine which type of device is being used to remain backward compatibility
    var device = {};
    
    if (context) {
        console.log("Supported Interfaces:" + JSON.stringify(context.System.device.supportedInterfaces));
        if (context.System.device.supportedInterfaces.Display) {
            device.type = "Show";
        } else {
            device.type = "Legacy";
        }
    } else {
        console.log("Test Dummy - no device info");
        device.type = "Test";
    }

    // Dispatch to your skill's launch.
    getWelcomeResponse(session, device, callback);
}

/**
 * Called when the user specifies an intent for this skill. This drives
 * the main logic for the function.
 */
function onIntent(intentRequest, session, context, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId +
        ", sessionId=" + session.sessionId);

    // need to determine which type of device is being used to remain backward compatibility
    var device = {};
    
    if (context) {
        console.log("Supported Interfaces:" + JSON.stringify(context.System.device.supportedInterfaces));
        if (context.System.device.supportedInterfaces.Display) {
            device.type = "Show";
        } else {
            device.type = "Legacy";
        }
    } else {
        console.log("Test Dummy - no device info");
        device.type = "Test";
    }

    var intent = intentRequest.intent,
        intentName = intentRequest.intent.name;
        country = intentRequest.locale;        

    // Dispatch to the individual skill handlers
    if ("GetWelcomeResponse" === intentName) {
        getWelcomeResponse(session, device, callback);
    } else if ("weightEntry" === intentName) {
         processWeight(intent, session, device, callback);
    } else if ("ageEntry" === intentName) {
         processAge(intent, session, device, callback);
    } else if ("heightEntry" === intentName) {
         processHeight(intent, session, device, callback);
    } else if ("genderMale" === intentName) {
        processGender("Male", intent, session, device, callback);
    } else if ("genderFemale" === intentName) {
        processGender("Female", intent, session, device, callback);
    } else if ("noExercise" === intentName) {
        processActivity(false, intent, session, device, callback);
    } else if ("activityLevel" === intentName) {
        processActivity(true, intent, session, device, callback);
    } else if ("AMAZON.StartOverIntent" === intentName) {
        getWelcomeResponse(session, device, callback);
    } else if ("AMAZON.HelpIntent" === intentName) {
        getHelpResponse(device, session, callback);
    } else if ("AMAZON.RepeatIntent" === intentName || "AMAZON.NextIntent" === intentName) {
        getWelcomeResponse(session, device, callback);
    } else if ("AMAZON.StopIntent" === intentName || "AMAZON.CancelIntent" === intentName || "AMAZON.NoIntent" === intentName) {
        handleSessionEndRequest(device, session, callback);
    } else {
        throw "Invalid intent";
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId +
        ", sessionId=" + session.sessionId);
}

// --------------- Base Functions that are invoked based on standard utterances -----------------------

// this is the function that gets called to format the response to the user when they first boot the app
function getWelcomeResponse(session, device, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Welcome to the metabolic calculator";

    var cardOutput = "Getting Started";
    var speechOutput = "Welcome! Please answer a few questions, " +
        "to calculate your specific Basal metabolic rate, as well as your recommended " +
        "daily intake of calories to maintain your current weight. " +
        "If you're ready to get started, please let us know your personal measurements by " +
        "saying something like, I currently weigh 180 pounds.";
    var repromptText = "If you're ready to get started, please begin by providing your weight. ";
    var activeStorms = false;

    console.log("Get Welcome Message - Device Type: " + JSON.stringify(device.type));

    VoiceLabs.track(session, 'Welcome Message', null, speechOutput, (error, response) => {    
        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
    });
}

// this is the function called when a weight is provided 
function processWeight(intent, session, device, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Welcome to Metabolic Calculator";
    var cardOutput = "";
    var speechOutput = "";

    // this is where prior data is stored
    if (session.attributes) {
        sessionAttributes = session.attributes;
    }

    // make sure that the weight slot is not undefined
    if (intent.slots.weight.value) {
        console.log("Weight provided: " + intent.slots.weight.value);

        if (intent.slots.weight.value === "?") {
            cardOutput = "No weight provided";
            speechOutput = "Sorry, I didn't follow what weight you provided. Please try again.";

            var repromptText = "Please provide your weight in pounds saying something like, I weight 150 pounds.";

            // process response
            VoiceLabs.track(session, 'Invalid Weight', null, speechOutput, (error, response) => {
                callback(sessionAttributes,
                    buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
            });

        } else {
            // in this case, a valid weight has been provided. save to session and prepare response
            sessionAttributes.weight = intent.slots.weight.value;
            promptRemainingDetail(sessionAttributes, session, device, callback);
        }
    } else {
        console.log("No weight provided.");

        cardOutput = "No weight provided";
        speechOutput = "Sorry, I didn't hear you provide a weight. Can you please try again.";
    
        var repromptText = "Please provide your weight in pounds saying something like, I weight 150 pounds.";

        // process response
        VoiceLabs.track(session, 'Invalid Weight', null, speechOutput, (error, response) => {
            callback(sessionAttributes,
                buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
        });
    }
}

// this is the function called when a weight is provided 
function processAge(intent, session, device, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Welcome to Metabolic Calculator";
    var cardOutput = "";
    var speechOutput = "";

    // this is where prior data is stored
    if (session.attributes) {
        sessionAttributes = session.attributes;
    }

    // make sure that the weight slot is not undefined
    if (intent.slots.age.value) {
        console.log("Age provided: " + intent.slots.age.value);

        if (intent.slots.age.value === "?") {
            cardOutput = "No age provided";
            speechOutput = "No age provided";

            // process response
            VoiceLabs.track(session, 'Invalid Age', null, speechOutput, (error, response) => {
                callback(sessionAttributes,
                    buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
            });
        } else {
	    // valid response - go to common function to process
            sessionAttributes.age = intent.slots.age.value;
            promptRemainingDetail(sessionAttributes, session, device, callback);
        }
    } else {
	// nothing provided in the slot - process error accordingly
        console.log("No age provided.");

        cardOutput = "No age provided";
        speechOutput = "No age provided. Please make sure you include the word years in your response.";
    
        var repromptText = "I'm sorry, I didn't understand your answer. Please let me know how many years old you are.";

        // process response
        VoiceLabs.track(session, 'Invalid Age', null, speechOutput, (error, response) => {
            callback(sessionAttributes,
                buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
        });
    }
}

// this is the function called when a height is provided 
function processHeight(intent, session, device, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Welcome to Metabolic Calculator";
    var cardOutput = "";
    var speechOutput = "";

    // this is where prior data is stored
    if (session.attributes) {
        sessionAttributes = session.attributes;
    }

    // make sure that the weight slot is not undefined
    if (intent.slots.heightFeet.value) {
        console.log("Height provided: " + intent.slots.heightFeet.value);

        if (intent.slots.heightFeet.value === "?") {
	    console.log("Invalid Height Value");
            cardOutput = "No height provided";
            speechOutput = "No height provided";

            var repromptText = "Please provide me your height by saying something like, I am five " +
                "feet and ten inches tall.";

            // process response
            VoiceLabs.track(session, 'Invalid Height', null, speechOutput, (error, response) => {
                callback(sessionAttributes,
                    buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
            });
        } else {
	    // valid response - at a minimum height in feet was provided
            sessionAttributes.heightFeet = intent.slots.heightFeet.value;

	    console.log("Valid Heigh Provided - now check if Inches were given");
            
            if (intent.slots.heightInches.value) {
                if (intent.slots.heightInches.value !== "?") {
                    sessionAttributes.heightInches = intent.slots.heightInches.value;
		}
            } 
            promptRemainingDetail(sessionAttributes, session, device, callback);
        }
    } else {
        console.log("No height provided.");

        speechOutput = "Sorry, I didn't hear you correctly. Can you please tell me your height by " +
	    "saying something like, I am five feet and ten inches tall.";
        cardOutput = "No height provided.";
    
        var repromptText = "Please provide me your height by saying something like, I am five " +
    	    "feet and ten inches tall.";

        // process response
        VoiceLabs.track(session, 'Invalid Height', null, speechOutput, (error, response) => {
            callback(sessionAttributes,
                buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
        });
    }
}

// this is the function called when a gender is provided 
function processGender(gender, intent, session, device, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Welcome to Metabolic Calculator";
    var cardOutput = "";
    var speechOutput = "";

    console.log("Gender Provided: " + gender);

    // this is where prior data is stored
    if (session.attributes) {
        sessionAttributes = session.attributes;
    }

    sessionAttributes.gender = gender;
    promptRemainingDetail(sessionAttributes, session, device, callback);
}

// this is what converts the BMR to a recommended intake based on exercise level
function processActivity(exercise, intent, session, device, callback) {
    var sessionAttributes = {};
    var shouldEndSession = true;
    var cardTitle = "Metabolic Calculator";
    var cardOutput = "Calculator";
    var speechOutput = "";
    var repromptText = "are we there yet?"
    var dci = 0;    

    console.log("Process exercise");
    
    // this is where prior data is stored
    if (session.attributes) {
        sessionAttributes = session.attributes;
    }
    
    if (sessionAttributes.bmr) {
        console.log("check for exercise");
        if (exercise) {
            console.log("check for frequency" + intent.slots.exerciseFrequency.value);
            if (intent.slots.exerciseFrequency.value) {
                if (intent.slots.exerciseFrequency.value > 5) {
		    dci = Math.round(sessionAttributes.bmr * 1.725);
                    speechOutput = "Based on a very heavy exercise rate, the recommended daily calorie intake " +
                        "for you to maintain your current weight is " + dci + " calories. " +
			"If you split this evenly over three meals, it would be " + Math.round(dci/3) + " per meal.";
                    cardOutput = "Breakeven intake: " + dci + " calories. ";
                } else if (intent.slots.exerciseFrequency.value > 2) {
		    dci = Math.round(sessionAttributes.bmr * 1.55);
                    speechOutput = "Based on a moderate exercise rate of " + intent.slots.exerciseFrequency.value + " times per week, " +
                        "the recommended daily daily calorie intake for you to maintain your current weight is " + dci + " calories. " +
			"If you split this evenly over three meals, it would be " + Math.round(dci/3) + " per meal.";
                    cardOutput = "Breakeven intake: " + dci + " calories. ";
                } else {
		    dci = Math.round(sessionAttributes.bmr * 1.375);
                    speechOutput = "Based on a light exercise rate, the recommended daily calorie intake " +
                        "for you to maintain your current weigh is " + dci + " calories. " +
			"If you split this evenly over three meals, it would be " + Math.round(dci/3) + " per meal.";
                    cardOutput = "Breakeven intake: " + dci + " calories. ";
                }
            } else {
                speechOutput = "Sorry, I didn't get that. How often do you exercise?";   
                shouldEndSession = false;
                // process response
                VoiceLabs.track(session, 'Invalid Exercise Level', null, speechOutput, (error, response) => {
                    callback(sessionAttributes,
                        buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
	        });
	    }
            VoiceLabs.track(session, 'Calculate Daily Intake', intent.slots.exerciseFrequency.value, speechOutput, (error, response) => {
                callback(sessionAttributes,
                    buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
            });
        } else {
	    dci = Math.round(sessionAttributes.bmr *1.2);
            speechOutput = "Based on having little or no exercise in your routine, the recommended daily calorie intake " +
                "for you to maintain your current weight is " + dci + " calories. " +
		"If you split this evenly over three meals, it would be " + Math.round(dci/3) + " per meal.";
            cardOutput = "Breakeven intake: " + dci + " calories. ";
            // process response
            VoiceLabs.track(session, 'Calculate Daily Intake', null, speechOutput, (error, response) => {
                callback(sessionAttributes,
                    buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
            });
        }
    } else {
        promptRemainingDetail(sessionAttributes, device, callback)
    }
}

// this function prepares the response based on what attributes are still required
function promptRemainingDetail(sessionAttributes, session, device, callback) {
    var shouldEndSession = false;
    
    var cardTitle = "Metabolic Counter";
    var speechOutput = "";
    var repromptText = "";
    var cardOutput = "To generate BMR, need to provide gender, height, weight, and age.";
    var bmr = 0;

    console.log("Processing Remaining Detail Checks");
    
    if (sessionAttributes.heightFeet && sessionAttributes.age && sessionAttributes.weight && sessionAttributes.gender) {
	console.log("Calculating MBR");
        if (sessionAttributes.gender === "Male") {
            // This is the male BMR calculation
            bmr = 66 + ( 6.2 * Number(sessionAttributes.weight)) + ( 12.7 * Number(sessionAttributes.heightFeet) * 12 ) + ( -6.76 * Number(sessionAttributes.age));
            if (sessionAttributes.heightInches) {
		if (sessionAttributes.heightInches !== "?") {
                  bmr = bmr + 12.7 * Number(sessionAttributes.heightInches);
		}
            }
        } else {
            // This is the female BMR calculation
            bmr = 655.1 + (4.35 * Number(sessionAttributes.weight)) + (4.7 * Number(sessionAttributes.heightFeet) * 12 ) + (- 4.7 * Number(sessionAttributes.age));
            if (sessionAttributes.heightInches) {
                if (sessionAttributes.heightInches !== "?") {
                    bmr = bmr + 4.7 * Number(sessionAttributes.heightInches);
		}
            }
        }

        bmr = Math.round(bmr);
        sessionAttributes.bmr = bmr;

	// build response based on information in session
        speechOutput = "Thank you for providing all the information I need. " +
            "I have you as a " + sessionAttributes.age + " year old " + sessionAttributes.gender + " . " +
            "You weigh " + sessionAttributes.weight + " pounds, and are " +
            sessionAttributes.heightFeet + " feet ";
        if (sessionAttributes.heightInches) {
	    if (sessionAttributes.heightInches !== "?") {
                speechOutput = speechOutput + sessionAttributes.heightInches + " inches ";
	    }
        }
        speechOutput = speechOutput + " tall. " +
            "Based on the Harris Benedict principle, your BMR is " + bmr + ". " + 
            "If any of these values are incorrect, just reply with the updated information. " +
            "If it is correct, let's convert this to your daily recommended caloric intake. " +
            "How often do you exercise? Either say I don't exercise, or something like " +
            "I exercise 2 days per week. ";
        cardOutput = "BMR: " + bmr + " calories.";
        repromptText = "Please let me know how often you exercise and I will generate " +
            "your recommended daily caloric intake. ";

	var calcBMR = {};
	    calcBMR.bmr = bmr;

        // process response
        VoiceLabs.track(session, 'BMR Calculated', calcBMR, speechOutput, (error, response) => {
            callback(sessionAttributes,
                buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
        });
            
    } else if (sessionAttributes.weight) {
        console.log("weight received");
        if (sessionAttributes.age) {
            console.log("age received");
            if (sessionAttributes.gender) {
                console.log("gender received");
                speechOutput = "How tall are you?";
                repromptText = "Please provide your height by saying your height. ";
            } else {
                console.log("need to find gender");
                speechOutput = "Are you male or female?";
                repromptText = "Please provide your gender to calculate your BMR. ";
            }
        } else {
            console.log("need to find age");
            speechOutput = "How old are you? For example, say I am forty years old.";
            repromptText = "Please provide your age in years to calculate your BMR. ";
        }
    } else {
        console.log("need to find weight");
        speechOutput = "How much do you weigh?";
        repromptText = "Please provide your weight to calculate your BMR.";
    }
    
    // process response
    console.log("Process response after validating entries" + speechOutput);
    VoiceLabs.track(session, 'Validate Entries', null, speechOutput, (error, response) => {
        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, cardOutput, repromptText, device, shouldEndSession));
    });
    
}

// this is the function that gets called to format the response to the user when they ask for help
function getHelpResponse(device, session, callback) {
    var sessionAttributes = {};
    var shouldEndSession = false;
    var cardTitle = "Help";
    
    // this is where prior data is stored
    if (session.attributes) {
        sessionAttributes = session.attributes;
    }
    
    // this will be what the user hears after asking for help
    var speechOutput = "There are several factors that influence your metabolism. Researchers " +
        "have found that gender, height, weight, and age all play a factor. A groundbreaking " +
        "study by James Arthur Harris and Francis Gano Benedict created a way of calculating " + 
        "humans Basal metabolic rate as well as the closely related Recommended Daily Calorie Intake " +
        "that provides the breakeven level at which an individual will maintain their current weight. " +
        "This skill walks through the calculation by asking questions around these factors, then " +
        "providing the customized profile. To get started, just say something like, I weigh 170 pounds, " +
        "and the skill will work through the other questions.";

    // if the user still does not respond, they will be prompted with this additional information
    var repromptText = "Please tell me how much you weigh, and the skill will walk through the " +
        "other necessary data points for calculating your BMR.";

    VoiceLabs.track(session, 'Help', null, speechOutput, (error, response) => {
        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, speechOutput, repromptText, device, shouldEndSession));
    });
}

// this is the function that gets called to format the response when the user is done
function handleSessionEndRequest(device, session, callback) {
    var cardTitle = "Thanks for using the BMR Calculator";
    var speechOutput = "Thank you for using the BMR Calculator. Have a nice day!";
    // Setting this to true ends the session and exits the skill.
    var shouldEndSession = true;

    VoiceLabs.track(session, 'End Session', null, speechOutput, (error, response) => {
        callback({}, buildSpeechletResponse(cardTitle, speechOutput, speechOutput, null, device, shouldEndSession));
    });
}

// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(title, output, cardInfo, repromptText, device, shouldEndSession) {
    console.log("build speechlet response");
    if (device.type === "Legacy") {
        return {
            outputSpeech: {
                type: "PlainText",
                text: output
            },
            card: {
                type: "Simple",
                title: title,
                content: cardInfo
            },
            reprompt: {
                outputSpeech: {
                    type: "PlainText",
                    text: repromptText
                }
            },
            shouldEndSession: shouldEndSession
        };
    } else {
        return {
            outputSpeech: {
                type: "PlainText",
                text: output
            },
            card: {
                type: "Simple",
                title: title,
                content: cardInfo
            },
            reprompt: {
                outputSpeech: {
                    type: "PlainText",
                    text: repromptText
                }
            },
            directives: [
                {
                type: "Display.RenderTemplate",
                template: {
                    type: "BodyTemplate2",
                    token: "T123",
                    backButton: "HIDDEN",
                    image: {
                        contentDescription: "image title",
                        sources: [
                            {
                                url: bucketLoc + "logos/scale-340x340.png"
                            }
                        ]
                        
                    },
                    backgroundImage: {
                        contentDescription: "StormPhoto",
                        sources: [
                            {
                                url: bucketLoc + "metabolicBackground.png"
                            }
                        ]
                    },
                    title: "Metabolic Calculator",
                    textContent: {
                        primaryText: {
                            text: cardInfo,
                            type: "PlainText"
                        }
                    }
                }
            }],
            shouldEndSession: shouldEndSession
        };        
    }
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}
