(function ()
{
    function randomDeg(magnitude)
    {
        return Math.random() < 0.5 ? -magnitude : magnitude;
    }

    function getTarget(e)
    {
        return e.target.closest('.button a, .button span');
    }

    document.addEventListener('mouseover', function (e)
    {
        var target = getTarget(e);
        if (!target || target.contains(e.relatedTarget)) return;

        var isSmall = target.closest('.button--sm') !== null;
        target.style.transform = 'rotate(' + randomDeg(isSmall ? 12 : 3) + 'deg)';
    });

    document.addEventListener('mouseout', function (e)
    {
        var target = getTarget(e);
        if (!target || target.contains(e.relatedTarget)) return;

        target.style.transform = '';
    });
})();
