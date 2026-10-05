using System;
using System.Net;
using System.Threading.Tasks;
using Xunit;

namespace Jellyfin.Server.Integration.Tests.Controllers;

public sealed class SubtitleControllerTests : IClassFixture<JellyfinApplicationFactory>
{
    private readonly JellyfinApplicationFactory _factory;
    private static string? _accessToken;

    public SubtitleControllerTests(JellyfinApplicationFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("0/Stream.vtt")]
    [InlineData("0/0/Stream.vtt")]
    public async Task GetSubtitle_Anonymous_ReturnsUnauthorized(string route)
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"Videos/{Guid.NewGuid()}/{Guid.NewGuid():N}/Subtitles/{route}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("0/Stream.vtt")]
    [InlineData("0/0/Stream.vtt")]
    public async Task GetSubtitle_Authenticated_PassesAuthorization(string route)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.AddAuthHeader(_accessToken ??= await AuthHelper.CompleteStartupAsync(client));

        var response = await client.GetAsync($"Videos/{Guid.NewGuid()}/{Guid.NewGuid():N}/Subtitles/{route}", TestContext.Current.CancellationToken);

        // The ids do not exist, so the request is rejected further down the pipeline, but not by authorization.
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
