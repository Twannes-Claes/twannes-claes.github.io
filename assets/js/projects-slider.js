$(document).ready(function ()
{
    const projectSettings =
    {
        arrows: true,
        infinite: true,
        slidesToShow: 1,
        mobileFirst: true,
        slidesToScroll: 1,
        draggable: true,
        centerMode: true,
        prevArrow: '<div class="button slick-prev button--sm"><span></span></div>',
        nextArrow: '<div class="button slick-next button--sm"><span></span></div>',
        responsive: [
            {
                breakpoint: 768,
                settings: "unslick"
            }
        ]
    };

    function initSlider($slider)
    {
        const settings = $.extend({}, projectSettings, { appendArrows: $slider.next('.slick-arrows') });
        $slider.slick(settings);
    }

    $('.slick--projects').each(function ()
    {
        initSlider($(this));
    });

    $(window).on('resize', function ()
    {
        if ($(window).width() < 768)
        {
            $('.slick--projects').each(function ()
            {
                if (!$(this).hasClass('slick-initialized'))
                {
                    initSlider($(this));
                }
            });
        }
    });
});
