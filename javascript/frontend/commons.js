/**
 * Author: Habib Naderi, Minh Nguyen (Department of Computer Science, University of Auckland) 
 *         Adam Smith (School of Computing and Communications, University of Lancaster)
 * 
 * 
 * This module implements a set of functions which are useful and used by other frontend modules.
 */

var pointsArray = [];
var painting;
var canvas;
var context;
var lastLength = 0;
var lastUndone;
var isMouseDown = false;
var isErasing = false;
var eraserRadius = 50;
var radius = 6;
var tabState = 'paint';

var body = $('body');
var canvasWidth = (body.innerWidth() * 2);
var canvasHeight = (body.innerHeight() * 2);
var circleDiv = document.getElementById('circle');
var canvasDiv = document.getElementById('canvasDiv');
var eraseMarginY = 0;
var eraseMarginX = 0;

// Default Instance Information:
var screenNumber = 1;
var myColour = "black";
var accessID;
var groupNumber;
var userID;

var totalTestTime = 0;
var startTime = 0;
var currentTime = 0;
var remainTime = 0;
var Name = "";
var AccessCode = "";
var undoArray = [];
var originalTitle = "";


function calculateRemainingTime(currentTime) {	
	remainTime =  parseInt(totalTestTime - (currentTime-startTime)/1000);	
	console.log("time received from backend: ", currentTime, totalTestTime, startTime, remainTime);
	if(remainTime >= 0){
		remainMin = parseInt(remainTime/60);
		remainSec =  parseInt(remainTime%60);
		if (remainSec.toString().length == 1) {
			remainSec = "0" + remainSec;
		}
		return {min: remainMin, sec: remainSec};
	}
	return {min: 0, sec:0};
}

function updateTimer(){	
	if(remainTime > 0) {
		remainTime = remainTime-1;	
		remainMin = parseInt(remainTime/60);
		remainSec =  parseInt(remainTime%60);
		if (remainSec.toString().length == 1) {
			remainSec = "0" + remainSec;
		}
		document.getElementById('timeRemained').innerHTML = remainMin + ":" + remainSec + " remaining";		
	}
	else{
		if (document.getElementById('timeRemained')) {
			document.getElementById('timeRemained').innerHTML = "Time is up!";	
			if (document.getElementById('top-right-button'))
				document.getElementById('top-right-button').style.display = "";
		}
	}
	checkAddEditTitle();	
}

function checkAddEditTitle(){
	if (document.getElementById('titleArea')) {
		if(document.getElementById('titleArea').value != ""){
			if(document.getElementById('enterTitle').style.color!="red")
				document.getElementById('enterTitle').value = "Edit Title";
		}
		else{
			if(document.getElementById('enterTitle').style.color!="red")
				document.getElementById('enterTitle').value = "Add Title";
		}
	}
}

function storeTestState(testState) {
	startTime = testState.StartTime
	currentTime = testState.CurrentTime		
	totalTestTime = testState.TestTime/1000;
	remainTime =  parseInt(totalTestTime - (currentTime-startTime)/1000);
	if (document.getElementById('timeRemained'))
		document.getElementById('timeRemained').innerHTML = "Contact server";
	var myVar = setInterval(function(){ 
		updateTimer() ;
	}, 1000);
	screenNumber = testState.CurrentScreen;
	if (DEMO && testState.DemoStopTimer == DEMO_TIMER_INACTIVE && document.getElementById('demo-button'))
		document.getElementById('demo-button').value = 'Next Test';
}

function storeSessionState(sessionState) {
	groupNumber = sessionState.TeamID;
	accessID = sessionState.AccessCode;	
	Name = sessionState.Name;
	AccessCode = sessionState.AccessCode;
	userID = sessionState.UserID;
}

function handleTitleBeingEdited(info) {
	console.log("TITLE_BEING_EDITED_MSG: ", info);
	if(Name != info.editingUser){
		document.getElementById('enterTitle').value = "Editing by " + info.editingUser;
		document.getElementById('enterTitle').style.color="red";
	}
}

function handleUpdateTitle(info) {
	console.log("UPDATE_TITLE_MSG-1: ", info);
	info.OperationData.title = info.OperationData.title.split("\\n").join('\n');
	//update title for everyone
	if(document.getElementById('titleArea')){
		if (document.getElementById('titleArea').value != info.OperationData.title) {
			document.getElementById('titleArea').value = info.OperationData.title;
			changed = true;
		}
		document.getElementById('enterTitle').value = "Add Title";
		document.getElementById('enterTitle').style.color="grey";
	}
	if (document.getElementById('drawing-title'))
		document.getElementById('drawing-title').innerHTML = "Title: "+info.OperationData.title
	checkAddEditTitle();	
}

function handleUndo(info) {
	var i;
	for(i = pointsArray.length - 1; i >=0; i--){
		point = pointsArray[i];			
		if(point.owner == info.userID){
			pointsArray.splice(i, 1);
			undoArray.push(point);			
			if(point.drag == false){				
				break;		
			}
		}
	}	
	resetCache();		
}

function handleRedo(info) {
	var i;
	var realDrag = false;
	for(i = undoArray.length - 1; i >=0; i--){
		point = undoArray[i];		
		if(point.owner == info.userID){						
			if(point.drag == false && realDrag){	
				break;		
			}
			else if(point.drag == false){
				realDrag = true;
			}			
			undoArray.splice(i, 1);
			pointsArray.push(point);			
		}				
	}
	resetCache();	
}

// Ask the server if we can move forward or backward:
function switchIntention(intention) {
	//undo and redo
	if(intention == 'undo'){
		socket.emit(UNDO_MSG, {userID: accessID, ScreenNumber: screenNumber, ObjectID: DOT, Operation: UNDO, OperationData:{}});  		
	}
	else if(intention == 'redo'){
		socket.emit(REDO_MSG, {userID: AccessCode, ScreenNumber: screenNumber, ObjectID: DOT, Operation: REDO, OperationData:{}});  		
	}
}

function stateSession() {	
	socket.emit(GET_STATE_REQ);	
}


function pushToSocket(type, data) {
	if(type== "draw") {			
		socket.emit(DRAW_MSG, { ScreenNumber: screenNumber, ObjectID: DOT, Operation: DRAW, OperationData: {x: data.x, y: data.y, rad: data.rad, drag: data.drag}}); 
		redraw(); 
	}
	else if(type=="erase") {			
		socket.emit(ERASE_MSG, { ScreenNumber: screenNumber, ObjectID: DOT, Operation: ERASE, OperationData: {x: data.x, y: data.y, rad: data.rad, drag: data.drag}}); 		
		redraw(); 
	}	
}

/* canvas event listeners */

function doTouchStart(e) {
	var touchX = e.targetTouches[0].pageX - this.offsetLeft;
	var touchY = e.targetTouches[0].pageY - this.offsetTop;

	if(!isErasing && !painting) {	
		painting = true;
		pushToSocket("draw", { x: touchX, y: touchY, drag: false, rad: radius, colour: myColour, owner: accessID, group: groupNumber, screen: screenNumber });
	}
	else {
		if (!painting) {
			circleDiv.style.top = (touchY - 50) + "px";
			circleDiv.style.left = (touchX - 50) + "px";
			$("#circle").stop(true, true).fadeIn();
			eraseLite(touchX, touchY, false);
		}
	}
};

function doMouseDown(e) {
	var mouseX = e.pageX - this.offsetLeft;
	var mouseY = e.pageY - this.offsetTop;
	
	if(!isErasing) {
		painting = true;
		pushToSocket("draw", { x: mouseX, y: mouseY, drag: false, rad: radius, colour: myColour, owner: accessID, group: groupNumber, screen: screenNumber });
	}
	else {
		isMouseDown = true;
		circleDiv.style.top = (mouseY - 50) + "px";
		circleDiv.style.left = (mouseX - 50) + "px";
		eraseLite(mouseX, mouseY, false);
		$("#circle").stop(true, true).fadeIn();
	}
};

function doTouchMove(e) {
	event.preventDefault();
	var touchX = e.targetTouches[0].pageX - this.offsetLeft;
	var touchY = e.targetTouches[0].pageY - this.offsetTop;
	
	if(!isErasing) {
		if(!painting) {
			addClickSimple(touchX, touchY, false, radius,  myColour, accessID);	
			painting = true;
		}
		else pushToSocket("draw", { x: (e.targetTouches[0].pageX - this.offsetLeft), y: (e.targetTouches[0].pageY - this.offsetTop), drag: true, rad: radius, colour: myColour, owner: accessID, group: groupNumber, screen: screenNumber });
	}
	else eraseLite(touchX, touchY, true);
};

function doMouseMove(e) {
	if(painting){		
		isMouseDown = true;
		pushToSocket("draw", { x: (e.pageX - this.offsetLeft), y: (e.pageY - this.offsetTop), drag: true, rad: radius, colour: myColour, owner: accessID, group: groupNumber, screen: screenNumber });
	}
	else if(isMouseDown) eraseLite(e.pageX - this.offsetLeft, e.pageY - this.offsetTop, true); 
};

function doTouchEnd() {
	painting = false;
	$("#circle").fadeOut();
};

function doMouseUp(e) {
	painting = false;
	isMouseDown = false;
	if(isErasing) $("#circle").fadeOut();
};

function doMouseLeave(e) {
	if(isMouseDown) painting = true;
	else painting = false;
};

function doMouseOver(e) {
	if(isMouseDown == true && isErasing == false) painting = true;
	else { 
		painting = false; 
		if(isMouseDown == true) isErasing = false;
	}
};

function prepareCanvas(bgImageUrl) {
	canvas = document.createElement('canvas');
	canvas.setAttribute('width', canvasWidth / 2);
	canvas.setAttribute('height', (canvasHeight - 460) / 2);
	canvas.setAttribute('id', 'canvasSimple');
	canvas.style.display = 'block';
	canvasDiv.appendChild(canvas);
	if(typeof G_vmlCanvasManager != 'undefined') canvas = G_vmlCanvasManager.initElement(canvas);
	context = canvas.getContext("2d");
	
	if (bgImageUrl != undefined) {
		switchBackground(bgImageUrl);
	} else {
		console.log("no background image");
	}
	
	// Event Handlers:
	enableCanvas();
	
	
	
	// Fix for HD Displays:
	if(window.devicePixelRatio == 2) {
		canvas.setAttribute('width', canvasWidth / 2);
		canvas.setAttribute('height', (canvasHeight /2) - 230);
		document.getElementById('deadzone-top').style.width = "100%";
		document.getElementById('deadzone-bottom').style.width = "100%";
	}	
	
	// Ask for Session Details:
	
	//stateSession();	
}

function addClickSimple(x, y, dragging, strokeradius, colour, owner) {
	pointsArray.push({"owner":owner, "x":x, "y":y, "drag":dragging, "radius":strokeradius, "colour":colour, "active":"1"});
}

function clearCanvas() {
	context.clearRect(0, 0, canvasWidth, canvasHeight);
}

window.onresize = function(event) {
     canvasWidth = body.innerWidth();
     canvasHeight = body.innerHeight();
};

function resizeCanvas() {
     canvasWidth = body.innerWidth();
     canvasHeight = body.innerHeight();
}

function redraw() {	
	if(pointsArray.length > lastLength){
	    //for(var i=(pointsArray.length-1); i>=lastLength; i--) {	
		for(var i=lastLength; i<=(pointsArray.length-1); i++) {	
			
			if(pointsArray[i].active == "1") {
				context.beginPath();	
				if(pointsArray[i].colour == "rgba(0,0,0,1)") context.globalCompositeOperation = "destination-out";
				else context.globalCompositeOperation = "source-over";			
				context.strokeStyle = pointsArray[i].colour;					
				context.lineCap = "round";
				context.lineWidth = pointsArray[i].radius;

				if ( i > 0 && (pointsArray[i].owner != pointsArray[i-1].owner) && (pointsArray[i].drag === true || pointsArray[i].drag === "true") ) {
					for(var x=i-2; x>=0; x--) {
						if(pointsArray[x].owner == pointsArray[i].owner) {
							context.moveTo( (pointsArray[i].x), (pointsArray[i].y) );
							context.lineTo(pointsArray[x].x, pointsArray[x].y);
							break;
						}
					}
				}
				else {
					if( (pointsArray[i].drag === true || pointsArray[i].drag === "true") && i) context.moveTo(pointsArray[i-1].x, pointsArray[i-1].y);
					else context.moveTo(pointsArray[i].x-1, pointsArray[i].y);
					context.lineTo(pointsArray[i].x, pointsArray[i].y);
				}
			context.stroke();
			}
		}
	}
	lastLength = pointsArray.length;
}

function switchBackground(url) {
	if (canvasDiv){
		console.log("background is: " + url);
		if(url != " " || url != "") canvas.style.background = 'url(' + url + ') no-repeat center ';
		else canvas.style.background = "white";
/*		var imageObj = new Image();
	    imageObj.onload = function() {
	        context.drawImage(this, 0, 0);
	      };
	    imageObj.src = "../images/picturecompletion/TTCT_Fig_Parts_Figure_"+screenNumber+".svg";
	    */		
	}	 
}

function resetCache() {
	lastLength = 0;
	clearCanvas();
	redraw();
}

function eraseLite(x, y, dragging) {
	if(isErasing) {
		circleDiv.style.top = (y + eraseMarginY) + "px";
		circleDiv.style.left = (x + eraseMarginX) + "px";
		pushToSocket("erase", { x: x, y: y, drag: dragging, rad: eraserRadius, colour: "rgba(0,0,0,1)", owner: accessID, group: groupNumber, screen: screenNumber });
	}
}

function switchMode(type) {
	if(type=="erase") {
		isErasing = true;
		if(tabState != 'erase') {
			$("#eraserCircle").fadeIn();
			$("#paintCircle").fadeOut();
			tabState = 'erase';
		}
	}
	else if(type=="paint") {
		isErasing = false;
		if(tabState != 'paint') {
			$("#paintCircle").fadeIn();
			$("#eraserCircle").fadeOut();
			tabState = 'paint';
		}
	}
}

function switchStroke(size, id) {
	if(id=='paintCircle') radius = size;
	else {
		eraserRadius = size;
		circleDiv.style.width = (eraserRadius) + "px";
		circleDiv.style.height = (eraserRadius) + "px";		
	}
	
	var startPos = 256;
	var buttonWidth = 60;
	var rightMargin = 5;
	var speed = 250;
	
	if(size==2 || size==10) { 
		$("#" + id).animate({
			left: (startPos - (buttonWidth * 2) - (rightMargin * 2))
		}, { duration: speed, queue: false });
		eraseMarginY = 165;
		eraseMarginX = 10;
	}
	else if(size==4 || size== 30) { 
		$("#" + id).animate({
			left: (startPos - buttonWidth - rightMargin)
		}, { duration: speed, queue: false });
		eraseMarginY = 155;
		eraseMarginX = 0;
	}
	else if(size==6 || size== 50) { 
		$("#" + id).animate({
			left: startPos
		}, { duration: speed, queue: false });
		eraseMarginY = 145;
		eraseMarginX = -10;		
	}
	else if(size==9 || size==75) { 
		$("#" + id).animate({
			left: (startPos + (buttonWidth) + (rightMargin))
		}, { duration: speed, queue: false });
		eraseMarginY = 135;
		eraseMarginX = -20;		
	}
	else if(size==12 || size==100) { 
		$("#" + id).animate({
			left: (startPos + (buttonWidth *2) + (rightMargin * 2))
		}, { duration: speed, queue: false });
		eraseMarginY = 120;
		eraseMarginX = -30;		
	}
}


function showInstructions(testName){
	console.log('showInstructions:', testName, document.getElementById('top-left-button').value);
	if(document.getElementById('top-left-button').value == 'Instructions'){
		document.getElementById('top-left-button').value = testName;
		Popup.show('practiceIntro');                        
	}
}

function sendRequestToNextTest(){	
	document.getElementById('top-right-button').value = 'Waiting for other participants ...';    
	socket.emit(PERM_REQ, START_TEST);  
}

function sendRequestToUpdateTitle(){
	socket.emit(PERM_REQ, EDIT_TITLE); 
	originalTitle = document.getElementById('titleArea').value;
}

function closeAndStart(){
	Popup.hideAll();
	document.getElementById('top-left-button').value = 'Instructions';
}

function saveTitle(){
	if (isValidText(document.getElementById('titleArea').value)) {
		var transaction = {ScreenNumber: screenNumber, ObjectID: TITLE, Operation: ADD, 
				OperationData: {"title": document.getElementById('titleArea').value}};
		socket.emit(UPDATE_TITLE_MSG, transaction); 
		Popup.hideAll();
		changed = true;
	} else {
		alert("There is invalid character(s), like \", in the title.");
	}
}

function cancelUpdateTitle(){
	var transaction = {ScreenNumber: screenNumber, ObjectID: TITLE, Operation: ADD, OperationData: {"title": originalTitle}};
	socket.emit(UPDATE_TITLE_MSG, transaction); 	 
	Popup.hideAll();
}

function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds){
      break;
    }
  }
}

function prepareCanvasForSnapshot(bgImagePath, callback, args) {
    var w = canvasSimple.width;
    var h = canvasSimple.height;
    
    context.globalCompositeOperation = "source-over";
    var data = canvasSimple.toDataURL();
  
	var bgImage = new Image();
    bgImage.onload = function() {
    	context.fillStyle = "#FFFFFF";
    	context.fillRect(0,0,w,h);    	
        context.drawImage(this, w / 2 - bgImage.width / 2,
                h / 2 - bgImage.height / 2);
        var drawingImage = new Image();
        drawingImage.onload = function() {
        	context.drawImage(drawingImage, 0, 0);
        	callback(args);
        }
        drawingImage.src = data;        
    };
    bgImage.src = bgImagePath;    	
}

function changeScreen(bgImagePath) {
    pointsArray.length = 0;
    undoArray.length = 0;
    lastLength = 0;
    clearCanvas();
    if (bgImagePath != undefined)
    	switchBackground(bgImagePath);
    document.getElementById('titleArea').value = "";
    document.getElementById('drawing-title').innerHTML = "Title:";
    socket.emit(GET_TRANSACTIONS_REQ);
}

function showScreenNumber(max) {
	document.getElementById('screenNumber').innerHTML = "&nbsp"+ screenNumber + " / " + max + "&nbsp";
}

function sendWaitMsg() {
	socket.emit(WAIT_MSG);
}

function getPosition(element) {
    var xPosition = 0;
    var yPosition = 0;
  
    while(element) {
        xPosition += (element.offsetLeft - element.scrollLeft + element.clientLeft);
        yPosition += (element.offsetTop - element.scrollTop + element.clientTop);
        element = element.offsetParent;
    }
    return { x: xPosition, y: yPosition };
}

function disableElements(elements) {
	for (i = 0; i < elements.length; i++) {
		element = document.getElementById(elements[i]);
		if (element) {
			element.disabled = true;
		}
	}
	if (canvasSimple != undefined)
		disableCanvas();
}

function enableElements(elements) {
	for (i = 0; i < elements.length; i++) {
		element = document.getElementById(elements[i]);
		if (element) {
			element.disabled = false;
		}
	}
	if (canvasSimple != undefined) 
		enableCanvas();	
}

function demoSetupButton() {
	if (DEMO) {
		document.getElementById('demo-button').style.display = "";
	}
}

function demoSendMsg() {
	if (document.getElementById('demo-button').value == 'Stop Timer') {
		socket.emit(DEMO_STOP_TIMER);
		document.getElementById('demo-button').value = 'Next Test';
	} else {
		socket.emit(DEMO_NEXT_TEST);
	}
}

function isTitleEmpty() {
	return document.getElementById('titleArea').value == "";
}

function isValidJSON(textEntry) {
	try {
		textObject = {"text":textEntry};
		textObjectString = JSON.stringify(textObject);
		textObject = eval("(" + textObjectString + ")");
		return true;
	} catch (ex) {
		return false;
	}	
}

function isValidSQL(textEntry) {	
	return textEntry.indexOf('"') > -1 ? false : true;
}

function isValidText(textEntry) {
	return isValidSQL(textEntry) && isValidJSON(textEntry);
}

function saveTitleAndSendResults() {
	document.getElementById('titleArea').value = document.getElementById('titleArea2').value; 
	if (!isTitleEmpty()) {
		if (isValidText(document.getElementById('titleArea').value)) {
			Popup.hideAll();
			changed = true;
			saveTitle();
			eval(document.getElementById('titleArea2').ctCallBack);
			document.getElementById('titleArea2').value = "";
		} else {
			alert("There is invalid character(s), like \", in the title.");
		}
	}
}

function askForTitle(callback) {
	Popup.hideAll();
	document.getElementById('titleArea2').ctCallBack = callback;
	Popup.show('askForTitle');
	socket.emit(NOTIFY_TEAM_MSG, {message: WAIT_FOR_TITLE, data:{accessCode: AccessCode, name: Name}});			
}

function sendNextScreenMsg() {
	if (isTitleEmpty() && changed) {
		askForTitle("sendNextScreenMsg()");
	} else {
		if (changed)
			socket.emit(NEXT_SCREEN_MSG, {"status": CHANGED, "screenNumber": screenNumber, "image":canvasSimple.toDataURL('image/png'), "title": document.getElementById('titleArea').value});
		else 
			socket.emit(NEXT_SCREEN_MSG, {"status": UNCHANGED, "screenNumber": screenNumber});
	}
}

function sendPrevScreenMsg() {
	if (isTitleEmpty() && changed) {
		askForTitle("sendPrevScreenMsg()");
	} else {
		if (changed) 
			socket.emit(PREV_SCREEN_MSG, {"status": CHANGED, "screenNumber": screenNumber, "image":canvasSimple.toDataURL('image/png'), "title": document.getElementById('titleArea').value});
		else
			socket.emit(PREV_SCREEN_MSG, {"status": UNCHANGED, "screenNumber": screenNumber});
	}
}

function blink(id) {
    var elm = document.getElementById(id);
    elm.style.color = elm.style.color == 'white'? 'black': 'white';
}

function enableCanvas() {
	canvasSimple.addEventListener("touchstart", doTouchStart, false);
    canvasSimple.addEventListener("touchmove", doTouchMove, true);
    canvasSimple.addEventListener("touchend", doTouchEnd, false);
	canvasSimple.addEventListener("mousedown", doMouseDown, false);
	canvasSimple.addEventListener("mousemove", doMouseMove, false);
	canvasSimple.addEventListener("mouseup", doMouseUp, false);
	canvasSimple.addEventListener("mouseleave", doMouseLeave, false);	
	canvasSimple.addEventListener("mouseover", doMouseOver, false);	
}

function disableCanvas() {
	canvasSimple.removeEventListener("touchstart", doTouchStart, false);
    canvasSimple.removeEventListener("touchmove", doTouchMove, true);
    canvasSimple.removeEventListener("touchend", doTouchEnd, false);
	canvasSimple.removeEventListener("mousedown", doMouseDown, false);
	canvasSimple.removeEventListener("mousemove", doMouseMove, false);
	canvasSimple.removeEventListener("mouseup", doMouseUp, false);
	canvasSimple.removeEventListener("mouseleave", doMouseLeave, false);	
	canvasSimple.removeEventListener("mouseover", doMouseOver, false);
}
