(function ()
{
    function randomDeg()
    {
        return Math.random() < 0.5 ? -3 : 3;
    }

    function attachTilt(trigger, target)
    {
        trigger.addEventListener('mouseenter', function ()
        {
            target.style.transform = 'rotate(' + randomDeg() + 'deg)';
        });
        trigger.addEventListener('mouseleave', function ()
        {
            target.style.transform = '';
        });
    }

    document.querySelectorAll('.button a, .button span').forEach(function (target)
    {
        attachTilt(target, target);
    });
})();
