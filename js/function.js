// JavaScript Document


////loading////
 
$(function () {
  // ローダー終了
  function end_loader() {
    $('.loader').fadeOut(800);
  }
  // テキスト表示
  function show_txt() {
    $('.flower-loader').fadeIn(400);
  }
  // テキスト非表示
  function hide_txt() {
    $('.flower-loader').fadeOut(1000);
  }
 
 // タイマー処理
  $(window).on('load', function () {
  // 処理②ページを開いて4秒後にテキスト表示（フェード時間0.4秒）
  setTimeout(function () {
    show_txt();
  }, 4000)
  // 処理③ページを開いて4秒後にアニメーション非表示（フェード時間1秒）
  setTimeout(function () {
    hide_txt();
  }, 1000)
  // 処理④ページを開いて5秒後にローダー非表示（フェード時間0.8秒）
  setTimeout(function () {
    end_loader();
  }, 3000)

  })
	
var flg = null;
  var check_access = function () {
    // ★sessionStorageの値を判定
    if (sessionStorage.getItem('access_flg')) {
      // 2回目以降
      flg = 1;
    } else {
      // 1回目
      sessionStorage.setItem('access_flg', true);
      flg = 0
    }
    return flg;
  }
 
  var $i = check_access();
  if($i == 0){
    // 1回目アクセスの処理
  }else{
    // 2回目アクセスの処理
  }
})



$(function(){
  
  //カーソル要素の指定
  var cursor=$("#cursor");
  //ちょっと遅れてついてくるストーカー要素の指定  
  var stalker=$("#stalker");
  
  //mousemoveイベントでカーソル要素を移動させる
  $(document).on("mousemove",function(e){
    //カーソルの座標位置を取得
    var x=e.clientX;
    var y=e.clientY;
    //カーソル要素のcssを書き換える用
    cursor.css({
      "opacity":"1",
      "top":y+"px",
      "left":x+"px"
    });
    //ストーカー要素のcssを書き換える用    
    setTimeout(function(){
      stalker.css({
        "opacity":"1",
        "top":y+"px",
        "left":x+"px"
      });
    },100);//カーソルより遅れる時間を指定
    
  });
});


/*hamburger*/
// $(document)に対してイベントを貼り、中にある #hamburger を監視する書き方に変更
//hamburgerという関数を宣言します。
$(document).on('click', '#hamburger', function(){
	$('#line1').toggleClass('line_1');
	$('#line2').toggleClass('line_2');
	$('#line3').toggleClass('line_3');
	$('nav').toggleClass('in');
    });

//ヘッダーロゴの色をスクロール位置で切り替える
function updateHeaderColor() {
  if ($(window).scrollTop() > 525) {
    $('#head_logo').addClass('change-color');
  } else {
    $('#head_logo').removeClass('change-color');
  }
}

//スクロールで文字がふわっと出る
$('.fuwa-animation').css('visibility', 'hidden');
function updateFuwaAnimation() {
  var windowHeight = $(window).height();
  var topWindow = $(window).scrollTop();
  $('.fuwa-animation').each(function () {
    var targetPosition = $(this).offset().top;
    if (topWindow > targetPosition - windowHeight + 100) {
      $(this).addClass('fadeInDown');
    }
  });
}

// eachTextAnimeにappeartextというクラス名を付ける定義
function EachTextAnimeControl() {
  $('.eachTextAnime').each(function () {
    var elemPos = $(this).offset().top - 50;
    var scroll = $(window).scrollTop();
    var windowHeight = $(window).height();
    if (scroll >= elemPos - windowHeight) {
      $(this).addClass("appeartext");
    } else {
      $(this).removeClass("appeartext");
    }
  });
}

// 画面をスクロールしたらまとめて実行する
$(window).on('scroll', function () {
  updateHeaderColor();
  updateFuwaAnimation();
  EachTextAnimeControl();
});



/*==================================================
モーダル
===================================*/

$('.modal-button').click(function(e){
    e.preventDefault();
    $($(this).attr('href')).fadeIn();
});

$('.modaal-close').click(function(e){
    e.preventDefault();
    $(this).closest('.modal-wrapper').fadeOut();
});