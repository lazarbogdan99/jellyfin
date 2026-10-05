using System;
using System.Globalization;
using System.Net;
using System.Threading.Tasks;
using Xunit;

namespace Jellyfin.Server.Integration.Tests.Controllers;

public sealed class HlsSegmentControllerTests : IClassFixture<JellyfinApplicationFactory>
{
    private readonly JellyfinApplicationFactory _factory;
    private static string? _accessToken;

    public HlsSegmentControllerTests(JellyfinApplicationFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("Audio/{0}/hls/segment/stream.mp3")]
    [InlineData("Audio/{0}/hls/segment/stream.aac")]
    [InlineData("Videos/{0}/hls/playlist/segment.ts")]
    public async Task GetHlsSegmentLegacy_Anonymous_ReturnsUnauthorized(string route)
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync(string.Format(CultureInfo.InvariantCulture, route, Guid.NewGuid()), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("Audio/{0}/hls/segment/stream.mp3")]
    [InlineData("Audio/{0}/hls/segment/stream.aac")]
    [InlineData("Videos/{0}/hls/playlist/segment.ts")]
    public async Task GetHlsSegmentLegacy_NonexistentSegment_NotFound(string route)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.AddAuthHeader(_accessToken ??= await AuthHelper.CompleteStartupAsync(client));

        var response = await client.GetAsync(string.Format(CultureInfo.InvariantCulture, route, Guid.NewGuid()), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
