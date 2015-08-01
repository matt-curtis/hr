window.addEventListener("load", function(){
	var previewImages = document.querySelectorAll("#beta-promo-iphone .promo-iphone-content > *");

	var startCrossFade = function(){
		var delay = 6 * 1000; // 6 seconds
		var index = 0;

		for(var i = 0; i<previewImages.length; i++){
			setTimeout(function(){
				var image = previewImages[index];

				image.setAttribute("data-visible", "");

				if(index > 0){
					previewImages[index-1].removeAttribute("data-visible");
				}

				if(index == previewImages.length-1){
					index = 0;

					setTimeout(function(){
						image.removeAttribute("data-visible");

						startCrossFade();
					}, delay);
				} else {
					index++;
				}
			}, delay * i);
		}
	};

	startCrossFade();
}, false);