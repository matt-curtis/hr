var onDocumentLoaded = function(){
	var link = document.getElementById("contact-and-support-link");
	var footer = document.getElementById("global-footer");

	link.addEventListener("click", function(e){
		e.preventDefault();

		window.scrollTo(0, document.body.scrollHeight);

		footer.classList.add("active");
	}, false);
};

var readyState = document.readyState;

if(readyState == "complete" || readyState == "interactive"){
	onDocumentLoaded();
} else {
	document.addEventListener("DOMContentLoaded", onDocumentLoaded, false);
}