# ==========================================
# 阶段一：编译构建阶段 (多架构自动适配)
# ==========================================
FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS builder

RUN apk add --no-cache git

WORKDIR /src

# 1. 直接复制当前目录下的依赖描述文件并下载
COPY go.mod go.sum ./
RUN go mod download

# 2. 复制项目所有的源文件 (包括 main.go 和 internal 文件夹等)
COPY . .

# 3. 读取多架构参数，自动进行交叉编译
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags="-s -w" -o /app-bin .


# ==========================================
# 阶段二：极简运行阶段 (Alpine 镜像，仅十几MB)
# ==========================================
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# 从构建阶段把编译好的二进制文件复制过来
COPY --from=builder /app-bin /app/app-bin

# 如果你有 index.html 网页文件要读取，也可以放开下面这行注释：
# COPY index.html /app/index.html

# 暴露端口 (根据你 Go 后端监听的端口修改，通常是 8000)
EXPOSE 8000

# 启动程序
CMD ["/app/app-bin"]
